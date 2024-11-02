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
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { S3Client, PutObjectCommand, CreateBucketCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const SQS = require("@aws-sdk/client-sqs");
// For Cognito 
const { CognitoIdentityProviderClient, InitiateAuthCommand, SignUpCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const verifier = CognitoJwtVerifier.create({
  userPoolId: userPoolId,
  tokenUse: "access",
  clientId: clientId,
});

const tokenSecret = "e9aae26be08551392be664d620fb422350a30349899fc254a0f37bfa1b945e36ff20d25b12025e1067f9b69e8b8f2ef0f767f6fff6279e5755668bf4bae88588";

let db; 

(async () => {
  try {
    db = await initializeDatabase(); 
  } catch (error) {
    console.error("Failed to connect to the database:", error);
    process.exit(1); 
  }
})();

// 1. Retrieve the user info from the database (Log in)
router.get("/api/login", async (req, res) => {
  
  const { email, password } = req.query;

  console.log("Querying user:", email);
  console.log("Entered password:", password);

  try {

    const command = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
      ClientId: clientId,
    });

    const response = await cognitoClient.send(command);
    const user = await db('user')
      .select("email", "password", "admin")
      .where({ email })
      .first(); 

      res.json({
        error: false,
        token: response.AuthenticationResult.AccessToken,
        user: { email: email, admin: user ? user.admin : "0" }
      });

  } catch (error) {
    // Internal server error, respond with 500 status code
    res.status(500).json({ error: true, message: "Internal server error" });
  }
});

// 2. Send the user info to the database 
router.post("/api/users", async (req, res) => {

  // Extract user data from request body
  const { email, password } = req.body;

  try {
    const command = new SignUpCommand({
      ClientId: clientId,
      Username: email,
      Password: password,
      UseAttributes: [{ Name: "email", Value: email }],
    });

    try {
      await cognitoClient.send(command);       
    } catch (error) {
      console.error("Cognito Signup error", error);
      return res.status(400).json({ success: false, message: "Failed to sign up user in cognito"});
    }

    // Construct user data object with hashed password
    const userData = {
      email,
      password: password
    };

    // Insert the user into the database
    // const db = req.app.locals.db; 
    const [userId] = await db("user").insert(userData);

    // Respond with success message and user ID
    res.status(201).json({ success: true, userId });
  } catch (error) {
    // Respond with error message if something goes wrong
    res.status(400).json({ success: false, message: error.message });
  }
});

const upload = multer({ storage: multer.memoryStorage() });

// Serve static files
router.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize the S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

const sqsQueueUrl = process.env.SQS_QUEUE_URL;

// Initialize the SQS client
const client = new SQS.SQSClient({
  region: "ap-southeast-2",
});

// Send a message to the SQS queue　when the user uploads the video to compress 
async function sendMessageToQueue(message) {
  const command = new SQS.SendMessageCommand({
    QueueUrl: sqsQueueUrl,
    DelaySeconds: 10,
    MessageBody: JSON.stringify(message),
 });

  try {
    const response = await client.send(command);
    console.log("Sending a message", response);
  } catch (error) {
    console.error("Error sending message to SQS:", error);
  }
}

// Define your API routes here (e.g., login, uploadMedia)
router.get('/', (req, res) => res.render('index', { title: 'Express' }));

// 3. Recieve the uploaded videos and process it 
router.post('/api/uploadMedia', upload.array('files'), async (req, res) => {
  
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

    // Iterate over each uploaded file
    for (const file of req.files) {
      try {
        // let processedMedia;
        const uniqueName = `${uuidv4()}.mp4`;

        if (file.mimetype.startsWith('video/')) {    
          // Upload the raw video to S3 first
          const s3Params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: `uploads/${uniqueName}`,
            Body: file.buffer,
            ContentType: file.mimetype,
          };

          await s3Client.send(new PutObjectCommand(s3Params));
          console.log('Uploaded raw video to S3:', uniqueName);

          const message = {
            fileS3Url: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/uploads/${uniqueName}`,
            uniqueName: uniqueName,
            originalName: file.originalname,
            mimetype: file.mimetype,
          };
  
          await sendMessageToQueue(message);

        } else {
          console.error(`Unsupported file type: ${file.mimetype}`);
          continue;
        }      
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        return res.status(500).json({ success: false, message: 'Failed to send a message to the queue' });
      }
    }

  } catch (error) {
    console.error('Error in uploadMedia:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
