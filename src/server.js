const express = require("express");
const os = require("os");

const app = express();
const PORT = 3000;

app.use(express.json());

// Function to get local IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();

  for (let iface in interfaces) {
    for (let i of interfaces[iface]) {
      if (i.family === "IPv4" && !i.internal) {
        return i.address;
      }
    }
  }
  return "localhost";
}

// Route
app.post("/data", (req, res) => {
  console.log(req.body);
  res.send("Data received");
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log(`Server running on:`);
  console.log(`→ http://localhost:${PORT}`);
  console.log(`→ http://${ip}:${PORT}`);
});
