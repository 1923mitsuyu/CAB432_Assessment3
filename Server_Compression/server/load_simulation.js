// This is the script for sending the request to compress the video for 5 mins 
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// URL of your Express server
const serverUrl = 'http://3.107.182.69:3001/api/uploadMedia'; 
// Path to a sample video file
const videoPath = '/Users/sanroyuuji/Desktop/SampleVideo_360x240_30mb.mp4'; 
// Number of requests to send per second
const numRequestsPerSecond = 1; 
// Duration of the test in milliseconds (5 minutes)
const testDuration = 5 * 60 * 1000; 

const sendRequest = async () => {
  try {

    const form = new FormData();
    form.append('files', fs.createReadStream(videoPath));

    await axios.post(serverUrl, form, {
      headers: {
        ...form.getHeaders(),
      },
    });

    console.log('Request sent successfully');
  } catch (error) {
     console.error('Error sending request:', error.response ? error.response.data : error.message);
  }
};

const startTest = () => {

  // Declare the length of the testing (5 mins) 
  const endTime = Date.now() + testDuration;

  // Run the interla codes every 1 second 
  const intervalId = setInterval(() => {

    // Check if 5 mins has been already passed 
    if (Date.now() >= endTime) {
      clearInterval(intervalId);
      console.log('Test completed');
      return;
    }

    // Sends 5 requests per second
    for (let i = 0; i < numRequestsPerSecond; i++) {
      sendRequest();
    }
  }, 7000);
};

// Call the testing function
startTest();