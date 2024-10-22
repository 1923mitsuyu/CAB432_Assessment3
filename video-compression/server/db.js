// const app = require('./app'); 
// const knex = require("knex");
// const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
// SSM = require("@aws-sdk/client-ssm");
// const client2 = new SSM.SSMClient({ region: "ap-southeast-2" });
// const client = new SecretsManagerClient({ region: "ap-southeast-2" });
// const secretName = process.env.SECRET_NAME;

// const hostParameterName = process.env.HOST_PARAMETER_NAME;
// const databaseParameterName = process.env.DATABASE_PARAMETER_NAME;

// async function getParameters() {
//     try {
  
//       // Retrieve the host parameter
//       const hostResponse = await client2.send(
//         new SSM.GetParameterCommand({
//           Name: hostParameterName
//         })
//        );
  
//       // Retrieve the database parameter
//       const databaseResponse = await client2.send(
//         new SSM.GetParameterCommand({
//            Name: databaseParameterName
//         })
//      );
    
//       // Log the values
//       console.log(`Host: ${hostResponse.Parameter.Value}`);
//       console.log(`Database: ${databaseResponse.Parameter.Value}`);
  
//       return {
//         host: hostResponse.Parameter.Value,
//         database: databaseResponse.Parameter.Value
//      };
  
//     } catch (error) {
//        console.log(error);
//     }
//   }

// async function getSecret(secretName) {
//     try {
//       const response = await client.send(new GetSecretValueCommand({
//         SecretId: secretName,
//         VersionStage: "AWSCURRENT",
//       }));
//       return JSON.parse(response.SecretString);
//     } catch (error) {
//       console.error("Error retrieving secret:", error);
//       throw error; 
//     }
//   }

// // Function to initialize the database
// async function initializeDatabase() {
//     try {
  
//       const secret = await getSecret(secretName);
//       const { host, database } = await getParameters();
//       const dbConfig = {
//         client: 'mysql2',
//         connection: {
//           host: host,  
//           database: database,  
//           user: secret.username,
//           password: secret.password,
//           port: secret.port || 3306,
//         },
//       };
  
//       app.locals.db = knex(dbConfig); 
//       await app.locals.db.raw('SELECT 1'); 
//       console.log("Connected to RDS database!");
//     } catch (error) {
//       console.error("Error initializing database:", error);
//       throw error;
//     }
//   }

//   module.exports = { initializeDatabase };