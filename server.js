const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'prophecy-game.html'));
});

const promptData = {
    classic: [
        "Your greatest adventure will begin when you find a...",
        "You will become famous for inventing a...",
        "Beware the person who offers you a...",
        "Your love life will dramatically change after a...",
        "You will achieve world peace by using a...",
        "Your secret superpower is the ability to control...",
        "A talking animal will give you terrible advice about...",
        "You'll find the answer to your life's problems at the bottom of a...",
    ],
    cringe: [
        "You will go viral on TikTok for accidentally...",
        "Your most embarrassing moment next week will involve a...",
        "You will try to impress your crush by showing them your...",
        "The group chat will expose you for secretly liking...",
        "Your search history will be read aloud at a family dinner, revealing your interest in...",
        "You'll get caught lip-syncing in the mirror to a...",
        "Your first text to a wrong number will be...",
        "You will confidently mispronounce the word...",
    ],
    fantasy: [
        "The ancient dragon guards a legendary treasure known as...",
        "You will unite the warring kingdoms with a magical...",
        "The court wizard foresees you will defeat the lich king using only a...",
        "Your quest is to retrieve the long-lost...",
        "An enchanted forest will grant you the power of...",
        "You'll befriend a grumpy dwarf who is surprisingly good at...",
        "The key to the forbidden temple is hidden inside a...",
        "Your noble steed is not a horse, but a surprisingly fast...",
    ]
};

let lobbies = {};

function generateLobbyId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    socket.on('createLobby', ({ playerName }) => {
        const lobbyId = generateLobbyId();
        lobbies[lobbyId] = {
            players: [{ id: socket.id, name: playerName, isHost: true }],
            gameState: null
        };
        socket.join(lobbyId);
        socket.emit('lobbyCreated', { lobbyId, players: lobbies[lobbyId].players });
    });

    socket.on('joinLobby', ({ playerName, lobbyId }) => {
        if (lobbies[lobbyId]) {
            lobbies[lobbyId].players.push({ id: socket.id, name: playerName, isHost: false });
            socket.join(lobbyId);
            socket.emit('joinedLobby', { lobbyId, players: lobbies[lobbyId].players, isHost: false });
            io.to(lobbyId).emit('playerJoined', { players: lobbies[lobbyId].players });
        } else {
            socket.emit('lobbyNotFound');
        }
    });
    
    socket.on('startGame', ({ theme, gameMode }) => {
        const lobbyId = Array.from(socket.rooms)[1];
        if (lobbies[lobbyId]) {
            const lobby = lobbies[lobbyId];
            let availablePrompts = [];
            if (theme === 'random') {
                availablePrompts = [...promptData.classic, ...promptData.cringe, ...promptData.fantasy];
            } else {
                availablePrompts = [...promptData[theme]];
            }
            
            lobby.gameState = {
                players: lobby.players,
                theme,
                gameMode,
                currentPlayerIndex: 0,
                currentRound: 0,
                prompts: shuffleArray(availablePrompts).slice(0, lobby.players.length),
                answers: []
            };

            if (gameMode === 'pass-and-build') {
                lobby.gameState.answers = Array(lobby.players.length).fill(null).map(() => Array(lobby.players.length).fill(''));
            } else { 
                lobby.gameState.answers = Array(lobby.players.length).fill('');
            }
            
            io.to(lobbyId).emit('gameStarted', lobby.gameState);
            handleNextTurn(lobbyId);
        }
    });

    socket.on('submitAnswer', ({ answer }) => {
        const lobbyId = Array.from(socket.rooms)[1];
        if (lobbies[lobbyId]) {
            const lobby = lobbies[lobbyId];
            const gameState = lobby.gameState;
            const playerIndex = lobby.players.findIndex(p => p.id === socket.id);

            if (gameState.gameMode === 'classic') {
                gameState.answers[playerIndex] = answer;
            } else if (gameState.gameMode === 'pass-and-build') {
                gameState.answers[gameState.currentRound][playerIndex] = answer;
            }
            
            gameState.currentPlayerIndex++;

            if (gameState.gameMode === 'pass-and-build' && gameState.currentPlayerIndex >= gameState.players.length) {
                gameState.currentPlayerIndex = 0;
                gameState.currentRound++;
            }
            
            const isGameOver = (gameState.gameMode === 'classic' && playerIndex === gameState.players.length - 1) ||
                               (gameState.gameMode === 'pass-and-build' && gameState.currentRound >= gameState.players.length);

            if (isGameOver) {
                io.to(lobbyId).emit('revealProphecies', gameState);
            } else {
                handleNextTurn(lobbyId);
            }
        }
    });
    
    socket.on('restartGame', () => {
        const lobbyId = Array.from(socket.rooms)[1];
        if (lobbies[lobbyId]) {
            lobbies[lobbyId].gameState = null;
            io.to(lobbyId).emit('returnToLobby');
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
        for (const lobbyId in lobbies) {
            const lobby = lobbies[lobbyId];
            const playerIndex = lobby.players.findIndex(p => p.id === socket.id);
            if (playerIndex > -1) {
                const wasHost = lobby.players[playerIndex].isHost;
                lobby.players.splice(playerIndex, 1);
                if (lobby.players.length === 0) {
                    delete lobbies[lobbyId];
                } else {
                    if (wasHost && lobby.players.length > 0) {
                        lobby.players[0].isHost = true;
                    }
                    io.to(lobbyId).emit('playerJoined', { players: lobby.players });
                }
                break;
            }
        }
    });
});

function handleNextTurn(lobbyId) {
    const lobby = lobbies[lobbyId];
    const gameState = lobby.gameState;
    
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    let prompt;

    if (gameState.gameMode === 'classic') {
        prompt = gameState.prompts[gameState.currentPlayerIndex];
    } else {
        const playerForThisTurnIndex = (gameState.currentPlayerIndex + gameState.currentRound) % gameState.players.length;
        const playerForThisTurn = gameState.players[playerForThisTurnIndex];
        prompt = `For ${playerForThisTurn.name}'s prophecy, write a line for the prompt: "${gameState.prompts[gameState.currentRound]}"`;
    }

    io.to(lobbyId).emit('nextTurn', {
        currentPlayerName: currentPlayer.name,
        prompt: prompt,
        isMyTurn: false
    });
    
    io.to(currentPlayer.id).emit('nextTurn', {
        currentPlayerName: currentPlayer.name,
        prompt: prompt,
        isMyTurn: true
    });
}


server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT} 🖥️`);
});
