const express = require('express');
const router = express.Router();
const { initializeDatabase } = require('../db'); 
const app = require('../app.js'); 
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
// const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { S3Client, PutObjectCommand, CreateBucketCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const SQS = require("@aws-sdk/client-sqs");

// Initialize the S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

let db; 

(async () => {
  try {
    db = await initializeDatabase(); 
    await processQueue(db); 
  } catch (error) {
    console.error("Failed to connect to the database:", error);
    process.exit(1); 
  }
})();

const checkBucketExists = async () => {
  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME }));
    console.log(`Bucket ${process.env.AWS_S3_BUCKET_NAME} created successfully.`);
  } catch (error) {
    if (error.name === 'BucketAlreadyOwnedByYou' || error.name === 'BucketAlreadyExists') {
      console.log(`Bucket ${process.env.AWS_S3_BUCKET_NAME} already exists.`);
    } else {
      console.error("Error creating bucket:", error);
    }
  }
};

// Listen 3002 only for websocket (Progress bar)
server.listen(3002, () => {
  console.log('Socket server listening on port 3002');
});

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3002", 
  },
});

const upload = multer({ storage: multer.memoryStorage() });

let reconnectAttempts = {};

// Serve static files
router.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const client = new SQS.SQSClient({
  region: "ap-southeast-2",
});

async function downloadFileFromS3(s3Url) {

  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  const key = s3Url.split(".com/")[1];
  console.log("key:" + key);
  
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key
  });

  try {
    const response = await s3Client.send(command);
    const buffer = await streamToBuffer(response.Body); 
    return buffer;
  } catch (error) {
    console.error("Error downloading file from S3:", error);
    throw error;
  }
}

const streamToBuffer = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
};

const sqsQueueUrl = process.env.SQS_QUEUE_URL;

// Process messages from SQS which is called every 5 seconds 
async function processQueue(db) {

  const receiveCommand = new SQS.ReceiveMessageCommand({
    QueueUrl: sqsQueueUrl,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,
    VisibilityTimeout: 20,
  });
  
  const waitTime = 5000; 
  const mediaIDs = [];

  // Watch the queue permanently when the server is running 
  while (true) { 

    let message; 

    try {
      // Recieve a message 
      const response = await client.send(receiveCommand);
      if (!response.Messages || response.Messages.length === 0) {
        console.log("No messages received.");
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue; 
      }
      else {
        // If there is a message to recieve, fetch the first data in the queue 
        message = response.Messages[0];
        console.log("Received message:", message.Body);
    
        const { fileS3Url, originalName, mimetype, uniqueName } = JSON.parse(message.Body);

        // Download the video from S3
        const fileBuffer = await downloadFileFromS3(fileS3Url);

        // Pass the file buffer and call the function to compress the data 
        const compressedMedia = await compressVideo(fileBuffer, io);
     
        // Check if the bucket already exists 
        await checkBucketExists();

        // Upload a compressed video to S3 bucket 
        const s3Params = {
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: `uploads/${uniqueName}`,
          Body: compressedMedia,
          ContentType: mimetype,
        };

        const command = new PutObjectCommand(s3Params);
        await s3Client.send(command);
        console.log('Uploaded compressed video to S3');

        // Insert video metadata into the RDS instance 
        const [mediaID] = await db('media').insert({
          file: fileS3Url,
          original_name: originalName,
        });

        mediaIDs.push(mediaID);
     
        // Generate a pre-signed URL to download the video file from S3 
        const command2 = new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: `uploads/${uniqueName}`,
        });
  
        let url;
  
        try {
          url = await getSignedUrl(s3Client, command2, { expiresIn: 3600 });
          console.log("Pre-signed URL:", url);
        } catch (err) {
          console.error("Error generating pre-signed URL:", err);
        }

        try {
          if (url) {
           io.emit('downloadURL', { downloadUrl: url });
           console.log('Download URL emitted to clients:', url);
         } else {
           throw new Error("URL could not be generated");
          }
         } catch (error) {
           console.error("Error emitting download URL:", error.message);
          //  io.emit('error', { message: "Failed to generate or emit download URL" });
         }
 
        // Delete the message from the queue once the request is completed 
        const deleteCommand = new SQS.DeleteMessageCommand({
          QueueUrl: sqsQueueUrl,
          ReceiptHandle: message.ReceiptHandle,
        });

        await client.send(deleteCommand);
        console.log("Message deleted from SQS.");

      }
    } catch (error) {
        console.error("Error processing SQS queue:", error);
        if (message && message.ReceiptHandle) {
          const deleteCommand = new SQS.DeleteMessageCommand({
            QueueUrl: sqsQueueUrl,
            ReceiptHandle: message.ReceiptHandle,
          });
     
           await client.send(deleteCommand);
           console.log("Message deleted from SQS due to error.");
         }
     
        // S3オブジェクトの削除を行う
        // console.log("Deleting an object in the bucket");
        // await deleteS3Object(`uploads/${uniqueName}`);
     
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
  }
}

// Check the queue every 5 second. Process teh
// Listen for a new client connection
io.on('connection', (socket) => {
  // Log the new client's unique socket ID
  console.log('New client connected', socket.id);

  // Initialize reconnect attempts for the new client
  reconnectAttempts[socket.id] = 0;

  // Listen for 'compression-progress' events sent from the client
  socket.on('compression-progress', (progress) => {
      // Log the compression progress percentage
      console.log(`Compression progress: ${progress.percent}%`);
  });

  // Listen for the 'disconnect' event when a client disconnects
  socket.on('disconnect', (reason) => {
      // Log the client's socket ID and the reason for disconnection
      console.log('Client disconnected', socket.id, reason);
      // Attempt to reconnect to the client 
      attemptReconnect(socket.id);
  });
});

// Function to attempt reconnection
function attemptReconnect(clientId) {
  const maxReconnectAttempts = 5;
  const reconnectInterval = 1000; // 1 second

  // Check if the client has reached the max reconnect attempts
  if (reconnectAttempts[clientId] < maxReconnectAttempts) {
      reconnectAttempts[clientId]++;
      console.log(`Attempting to reconnect client ${clientId}... Attempt ${reconnectAttempts[clientId]}`);

      setTimeout(() => {
          const socket = io.sockets.sockets.get(clientId); 
          if (socket) {
              console.log(`Client ${clientId} reconnected successfully.`);
              reconnectAttempts[clientId] = 0; 
          } else {
              // If the socket is not found, attempt another reconnect
              attemptReconnect(clientId);
          }
      }, reconnectInterval);
  } else {
      console.log(`Max reconnect attempts reached for client ${clientId}. Giving up.`);
  }
}

// Define your API routes here (e.g., login, uploadMedia)
router.get('/', (req, res) => res.render('index', { title: 'Express' }));

// Compress videos uploaded from users
const compressVideo = (inputBuffer, socket) => {
  return new Promise((resolve, reject) => {

    // Define temporary file paths for input and output videos
    const tempInputPath = path.join(__dirname, 'temp_input.mp4');
    const tempOutputPath = path.join(__dirname, 'temp_output.mp4');

    // Write the input buffer (video data) to a temporary file
    fs.writeFile(tempInputPath, inputBuffer, (err) => {
      if (err) {
        return reject(new Error('Failed to save input file'));
      }

      // Start the video compression process using ffmpeg
      ffmpeg(tempInputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-crf 23',
          '-preset medium',
          '-movflags +faststart',
          '-profile:v high',
          '-level 4.1'
        ])
        .on('start', () => console.log('Compression started.'))
        .on('progress', (progress) => {
          console.log(`Progress: ${progress.percent}%`);
          try {
            // Emit the compression progress to the client using socket.io
            io.emit('compression-progress', progress); 
            // socket.to(socket.id).emit('compression-progress', progress);
          } catch (error) {
            console.error('Failed to emit compression-progress:', error);
          }
        })
        .on('end', async() => {
          fs.readFile(tempOutputPath, (err, outputBuffer) => {
            // Clean up temporary files after compression
            if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
            if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);

            if (err) {
              return reject(new Error('Failed to read output file'));
            }
            // Resolve the promise with the compressed video buffer
            resolve(outputBuffer);
          });
        })
        .on('error', (error) => {
          console.error('Error during video compression:', error);
          // Clean up temporary files after compression
          if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
          if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
          reject(new Error('Video compression failed'));
        })
        // Save the compressed video to the output path
        .save(tempOutputPath);
    });
  });
};

// Function to delete an object from S3
const deleteS3Object = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
  });
  await s3Client.send(command);
};

module.exports = router;
