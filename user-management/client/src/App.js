import Login from "./components/Login";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

function App() {
  
  return (
      <div>
        <header>
          <Router basename="/">
            <Routes>
              <Route path="/" element={<Login/>} />
            </Routes>
          </Router>
        </header>
      </div>
  );
}  

export default App;
