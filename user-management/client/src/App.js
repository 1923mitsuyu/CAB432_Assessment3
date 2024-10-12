import Login from "./components/Login";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

function App() {
  
  return (
      <div>
        <header>
          <Router basename="/login">
            <Routes>
              <Route path="/login" element={<Login/>} />
            </Routes>
          </Router>
        </header>
      </div>
  );
}  

export default App;
