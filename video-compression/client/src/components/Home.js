import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { useAuth } from './Auth';

const Home = ({ isAuthenticated }) => {

    const [selectedFiles, setSelectedFiles] = useState([]);
    const [uploading, setUploading] = useState(false); 
    const [errorMessage, setErrorMessage] = useState(""); 
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showAlert, setShowAlert] = useState(false);
    const navigate = useNavigate();
    const { logout } = useAuth();

    let socket;
    const connectSocket = () => {
        
        socket = io('http://3.106.121.122:3002', {
            transports: ['websocket'],
        });

        // Set up listeners inside the connection function
        socket.on('connect', () => {
            console.log('Connected to server');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server. Attempting to reconnect...');
            // Call the function to reconnect to the server if neccessary 
            attemptReconnect();
        });

        socket.on('compression-progress', (progress) => {
            try {
                console.log(`Compression progress: ${progress.percent}%`);
                setUploadProgress(progress.percent);
            } catch (error) {
                console.error('Error handling compression-progress:', error);
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
        });
    };

    useEffect(() => {

        connectSocket(); 

        // Cleanup function
        return () => {
            if (socket) {
                socket.off('compression-progress');
                socket.disconnect();
            }
        };
    }, [isAuthenticated]); 

    function attemptReconnect() {
        setTimeout(() => {
            connectSocket(); 
        }, 1000);
    }

    // Get the files selected from the user 
    const handleFileChange = (e) => {
        const filesArray = Array.from(e.target.files);
        setSelectedFiles(filesArray);
        console.log("selected files are:", filesArray);
        // Clear any previous error messages
        setErrorMessage(""); 
    }

    // Log out (Navigate to the login page and remove the token)
    const handleLogOff = () => {
        // Navigate to the log in / sign up page when the log off button is pressed
        
        logout();
    }

    // Compress the uploaded videos 
    const uploadVideosOrImages = async () => {

        // Return if the upload button is pressed with no uploaded files  
        if (selectedFiles.length === 0) return;

        const formData = new FormData();
        selectedFiles.forEach(file => {
            formData.append('files', file);
        });

        // Displays "uploading" on the button
        setUploading(true); 

        try {
            // Take the api url from .env file
            const apiUrl = process.env.REACT_APP_API_BASE_URL; 
            // Fetch the endpoint to compress the uploaded video 
            const response = await fetch(`${apiUrl}/api/uploadMedia`, { 
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Upload has failed unfortunately');
            }

            const data = await response.json();
            
            // Create a download link once the compression is successfully done
            if (data.success && data.downloadUrl){
                const link = document.createElement('a');
                link.href = data.downloadUrl;
                link.download = 'video.mp4'; 
                document.body.appendChild(link);
                link.click();
                link.remove();

                // Displays the alert on the top of the app when the compression is done
                setShowAlert(true);

                // Remove the alert and reset the progress bar in 4 seconds after the compression is done
                setTimeout(() => {
                    setShowAlert(false);
                    setUploadProgress(0);
                }, 4000);
            }
            else {
                console.log("No data to download")
            }

            // Reset the chosen file and remove a potential error message
            setSelectedFiles([]);
            setErrorMessage(""); 

        } catch (error) {
            console.error('Error:', error);
            setErrorMessage(error.message); 
        } finally {
            // Displays "upload" on the button
            setUploading(false); 
        }
    }

    return (
        // Header
        <div className="relative min-h-screen p-4 bg-sky-100">
            <header className="absolute top-0 left-0 right-0 bg-blue-600 text-white text-2xl font-bold p-4">
                <div className="max-w-screen-xl mx-auto flex items-center justify-between">
                    <div>Video Compressor</div>
                    <button 
                        className="bg-blue-400 text-white rounded-lg px-3 py-1 hover:bg-blue-800 transition"
                        // Jump to the log in / sign up page 
                        onClick={() => handleLogOff()}
                    >
                        Log Off
                    </button>
                </div>
            </header>
            {/* Centered upload area */}
            <div className="flex justify-center mt-20">
                <div className="flex flex-col items-center">
                {/* Show the alear when the compression succeeded */}
                { showAlert && 
                      <div className="fixed top-7 bg-teal-100 border-t-4 border-teal-500 rounded-b text-teal-900 px-4 py-3 mb-10 shadow-md z-50" role="alert">
                      <div className="flex">
                          <div className="py-1"><svg className="fill-current h-6 w-6 text-teal-500 mr-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z"/></svg></div>
                      <div>
                      <p className="font-bold">Compression Succeeded!</p>
                      <p className="text-sm">You can check the video!</p>
                      </div>
                      </div>
                  </div>
                }
                <div className="text-4xl font-bold mt-10 mb-10">Choose videos to make lighter!</div>
                {/* Progress Bar */}
                    <div className="mb-10 h-1 w-full bg-neutral-200 dark:bg-neutral-600">
                        <div className="h-1 bg-green-500" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                    {/* Video Uploading Platform */}
                    <div className="flex flex-col items-center bg-white p-6 rounded-lg shadow-md">
                        <input
                            type="file"
                            // allow only videos not other types of media such as images
                            accept="video/*"
                            className="mb-4 text-sm text-gray-500"
                            // multiple
                            // Get the video the user has uploaded 
                            onChange={handleFileChange}
                        />
                        {/* Display the uploaded video */}
                        {selectedFiles.length > 0 && (
                            <ul className="mb-4">
                                {selectedFiles.map((file, index) => (
                                    <li key={index} className="text-gray-700">{file.name}</li>
                                ))}
                            </ul>
                        )}
                        <button 
                            className={`bg-blue-500 text-white rounded-lg px-4 py-2 hover:bg-blue-600 transition ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            // Start the compression when the button is pressed
                            onClick={uploadVideosOrImages}
                            // Disable the button when the compression is in the process
                            disabled={uploading} 
                        >
                            {uploading ? 'Uploading...' : 'Upload Video'}
                        </button>
                        {/* Displays the error message */}
                        {errorMessage && <p className="text-red-500 mt-2">{errorMessage}</p>} {/* Show error message */}
                    </div>
                </div>
            </div>
            <div>
        </div>
        </div>
    );
};

export default Home;
