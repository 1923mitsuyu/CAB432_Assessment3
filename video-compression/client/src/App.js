import Home from "./components/Home";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";

function App() {
  
  return (
      <div>
        <header>
          <Router basename="/">
            <Routes>
              <Route 
                path="/home" 
                element= {<Home /> } />
            </Routes>
          </Router>
        </header>
      </div>
  );
}  

export default App;
