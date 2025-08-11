// server.js
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// This tells Express to serve your HTML, CSS, and JS file from the 'public' folder
app.use(express.static('public'));

// A simple catch-all route to serve your game's HTML file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'prophecy-game.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT} 🖥️`);
});
