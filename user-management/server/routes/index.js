const express = require('express');
const router = express.Router();
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config();
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

// const upload = multer({ storage: multer.memoryStorage() });

// Serve static files
router.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Define your API routes here (e.g., login, uploadMedia)
router.get('/', (req, res) => res.render('index', { title: 'Express' }));

const tokenSecret = "e9aae26be08551392be664d620fb422350a30349899fc254a0f37bfa1b945e36ff20d25b12025e1067f9b69e8b8f2ef0f767f6fff6279e5755668bf4bae88588";

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

    const db = req.app.locals.db;
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
    const db = req.app.locals.db; 
    const [userId] = await db("user").insert(userData);

    // Respond with success message and user ID
    res.status(201).json({ success: true, userId });
  } catch (error) {
    // Respond with error message if something goes wrong
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;

