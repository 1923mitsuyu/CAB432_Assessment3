const express = require('express');
const router = express.Router();
const app = require('../app');
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { S3Client, PutObjectCommand, CreateBucketCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Initialize the S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

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
              reconnectAttempts[clientId] = 0; // Reset the attempts on success
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

// 3. Recieve the uploaded videos and process it 
router.post('/api/uploadMedia', upload.array('files'), async (req, res) => {
  
  const db = req.app.locals.db; 

  // Start a transaction
  const trx = await db.transaction();

  try {

    // Check if any files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    // Create a directory to save uploaded files
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const mediaIDs = [];
    let compressedFilePath = '';

    // Iterate over each uploaded file
    for (const file of req.files) {
      try {
        let processedMedia;
        const uniqueName = `${uuidv4()}.mp4`;

        if (file.mimetype.startsWith('video/')) {
          // Call the function to compress the video
          processedMedia = await compressVideo(file.buffer, io);
          compressedFilePath = uniqueName;
        } else {
          console.error(`Unsupported file type: ${file.mimetype}`);
          continue;
        }

        // Check if the bucket already exists 
        await checkBucketExists();

        // Declare the S3 bucket 
        const s3Params = {
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: `uploads/${compressedFilePath}`,
          Body: processedMedia,
          ContentType: file.mimetype,
        };

        // Upload the video files to S3 bucket 
        let s3Response;
        try {
          const command = new PutObjectCommand(s3Params);
          s3Response = await s3Client.send(command);
          console.log('S3 Upload Response:', s3Response);
        } catch (s3Error) {
          console.error('Error uploading to S3:', s3Error);
            return res.status(500).json({ success: false, message: 'Failed to upload to S3' });
        }

        const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/uploads/${uniqueName}`;
        
        // Insert the video metadata into the RDS instance within the transaction
        const [mediaID] = await trx('media').insert({
          file: s3Url,
          original_name: file.originalname,
        });

        mediaIDs.push(mediaID);

        // If successful, commit the transaction
        await trx.commit();

      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        // If an error occurs in the database insertion, delete the uploaded object from S3 bucket.  
        console.log("Deleting an object in the bucket");
        await deleteS3Object(`uploads/${compressedFilePath}`);
         // Roll back the transaction to undo changes
        await trx.rollback();
        return res.status(500).json({ success: false, message: 'Failed to insert metadata into RDS and file deleted from S3' });
      }
    }

    if (mediaIDs.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid files processed' });
    }

    // Generate a pre-signed URL to download the video file from S3 
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `uploads/${compressedFilePath}`,
    });

    let url;

    try {
      url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      console.log("Pre-signed URL:", url);
    } catch (err) {
      console.error("Error generating pre-signed URL:", err);
      return res.status(500).json({ success: false, message: err.message });
    }

    const downloadUrl = url;
    res.status(201).json({ success: true, downloadUrl });

  } catch (error) {
    console.error('Error in uploadMedia:', error);
    // Rollback the transaction in case of error
    await trx.rollback();
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

