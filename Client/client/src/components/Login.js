import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// import { useAuth } from './Auth';
import '../App.css';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();
  // const { token, login } = useAuth();

  // useEffect(() => {
  //   if (token) {
  //     // Redirect to the home page 
  //     window.location.href = 'http://ec2-13-239-32-88.ap-southeast-2.compute.amazonaws.com/home:3000'; // Change this to the correct url 
  //   }
  // }, [token, navigate]);

  const LoginForm = ({ setIsLogin }) => {

    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    const validateLoginInfo = async () => {

      setErrorMessage("");

      try {
        
        if (!loginEmail && !loginPassword) {
          throw new Error('Please enter both email and password.');
        } else if (!loginEmail) {
          throw new Error('Please enter your email address.');
        } else if (!loginPassword) {
          throw new Error('Please enter your password.');
        }

        const apiUrl = process.env.REACT_APP_API_BASE_URL;

        console.log("Sending login request to:", `${apiUrl}/api/login`);

        const response = await fetch(`http://${apiUrl}:3001/api/login?email=${encodeURIComponent(loginEmail)}&password=${encodeURIComponent(loginPassword)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        console.log("Response status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Error response:", errorText);
          throw new Error('Login failed. Please check your email and password.');
        }

        const data = await response.json();

        if (data.error) {
          setErrorMessage(data.message || "Invalid email or password. Please try again.");
        } else {
          console.log("Login successful, token:", data.token);
          // login(data.token);
          // Redirect to the home page 
          navigate('/home');
          // window.location.href = `http://${apiUrl2}:3000`; 
        }
      } catch (error) {
        console.error("Login error:", error);
        setErrorMessage(error.message);
      }
    };

    return (
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full md:w-1/3 items-center max-w-4xl transition duration-1000 ease-out">
        <div className="inline-block justify-center w-20 border-blue-400 border-solid"></div>
        <h3 className='text-xl font-semibold text-blue-400 pt-2'>Sign In</h3>
        <div className='flex flex-col items-center justify-center'>
          <input
            type='email'
            className='rounded-2xl px-2 py-1 w-4/5 md:w-full border-[1px] border-blue-400 m-1 focus:shadow-md focus:border-pink-400 focus:outline-none focus:ring-0'
            placeholder='Email'
            onChange={(e) => setLoginEmail(e.target.value)}
          />
          <input
            type="password"
            className='rounded-2xl px-2 py-1 w-4/5 md:w-full border-[1px] border-blue-400 m-1 focus:shadow-md focus:border-pink-400 focus:outline-none focus:ring-0'
            placeholder='Password'
            onChange={(e) => setLoginPassword(e.target.value)}
          />
          {errorMessage && (
            <div className='text-red-500 mt-2'>{errorMessage}</div>
          )}
          <button
            className='rounded-2xl m-2 text-white bg-blue-400 w-2/5 px-4 py-2 shadow-md hover:text-blue-400 hover:bg-white transition duration-200 ease-in'
            onClick={validateLoginInfo}
          >
            Sign In
          </button>
        </div>
        <div className="inline-block border-[1px] justify-center w-20 border-blue-400 border-solid"></div>
        <p className='text-blue-400 mt-4 text-sm'>Don't have an account?</p>
        <p
          className='text-blue-400 mb-4 text-sm font-medium cursor-pointer'
          onClick={() => setIsLogin(false)}
        >
          Sign up
        </p>
      </div>
    );
  };

  const SignUpForm = ({ setIsLogin }) => {

    const [registerEmail, setRegisterEmail] = useState("");
    const [registerPassword, setRegisterPassword] = useState("");
    const [pressButton, setPressButton] = useState(false);
    const [error, setError] = useState("");

    const submitUserInfo = async () => {
      setPressButton(true);

      try {

        if (!registerEmail && !registerPassword) {
          throw new Error('Please enter both email and password.');
        } else if (!registerEmail) {
          throw new Error('Please enter your email address.');
        } else if (!registerPassword) {
          throw new Error('Please enter your password.');
        }

        const apiUrl = process.env.REACT_APP_API_BASE_URL;
        const apiUrl2 = process.env.REACT_APP_API_BASE_URL2;
        
        const response = await fetch(`http://${apiUrl}:3001/api/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: registerEmail,
            password: registerPassword,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Account creation failed. Please try again.');
        }

        const data = await response.json();

        if (data.success) {
          setIsLogin(true);
          // window.location.href = `http://${apiUrl2}:3000`; 
          navigate('/home');
        } else {
          setError(data.message || 'Account creation failed. Please try again.');
        }
      } catch (error) {
        setError(error.message);
      }
    };


    return (
      <div className="bg-blue-400 rounded-2xl shadow-2xl flex flex-col w-full md:w-1/3 items-center max-w-4xl transition duration-1000 ease-in">
        <div className="inline-block justify-center w-20 border-white border-solid"></div>
        <h3 className='text-xl font-semibold text-white pt-2'>Create a New Account</h3>
        <div className='flex flex-col items-center justify-center mt-2'>
          <input
            type='email'
            className={`rounded-2xl px-2 py-1 w-4/5 md:w-full border-[1px] border-blue-400 m-1 focus:shadow-md focus:border-pink-400 focus:outline-none focus:ring-0 ${registerEmail || !pressButton ? 'placeholder-black' : 'placeholder-red'}`}
            placeholder={registerEmail || !pressButton ? 'Email' : "Enter an email"}
            onChange={(e) => setRegisterEmail(e.target.value)}
          />
          <input
            type="password"
            className={`rounded-2xl px-2 py-1 w-4/5 md:w-full border-[1px] border-blue-400 m-1 focus:shadow-md focus:border-pink-400 focus:outline-none focus:ring-0 ${registerPassword || !pressButton ? 'placeholder-black' : 'placeholder-red'}`}
            placeholder={registerPassword || !pressButton ? 'Password' : "Enter a password"}
            onChange={(e) => setRegisterPassword(e.target.value)}
          />
          <button
            className='rounded-2xl m-4 text-blue-400 bg-white w-3/5 px-4 py-2 shadow-md hover:text-white hover:bg-blue-400 transition duration-200 ease-in'
            onClick={submitUserInfo}
          >
            Sign Up
          </button>
          {error && <p className='text-red-500 mt-2'>{error}</p>}
        </div>
        <div className="inline-block border-[1px] justify-center w-20 border-white border-solid"></div>
        <p className='text-white mt-4 text-sm'>Already have an account?</p>
        <p
          className='text-white mb-4 text-sm font-medium cursor-pointer'
          onClick={() => setIsLogin(true)}
        >
          Log in
        </p>
      </div>
    );
  };

  return (
    <div className="bg-gray-100 flex flex-col items-center justify-center min-h-screen md:py-2">
      <main className="flex items-center w-full px-2 md:px-20">
        <div className="hidden md:inline-flex flex-col flex-1 space-y-1 pl-10 pb-9">
          <p className='text-7xl text-blue-500 font-bold'>Video Compressor</p>
          <p className='font-medium text-lg pl-3 leading-1 text-pink-400'>
            Want to lighten your videos? You've come to the right place!
          </p>
        </div>
        {
          isLogin ? (
            <LoginForm setIsLogin={setIsLogin} />
          ) : (
            <SignUpForm setIsLogin={setIsLogin} />
          )}
      </main>
    </div>
  );
};

export default Login;


