require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const express = require('express');

// Configuration globale
const config = {
    // Liste des tokens Discord
    tokens: process.env.DISCORD_TOKENS.split(','),
    
    // Liste des channels vocaux (doit avoir le même nombre d'éléments que tokens)
    voiceChannels: process.env.VOICE_CHANNELS.split(','),
    
    // Connexion vocale
    voice: {
        selfMute: false,
        selfDeaf: false,
        selfVideo: false,
        maxConnectionAttempts: 3, // Tentatives max par token
        retryDelay: 30000, // 30 secondes entre les tentatives
        connectionTimeout: 30000 // 30 secondes timeout
    }
};

// Initialisation
const clients = [];
const app = express();
const PORT = process.env.PORT || 3000;

// Serveur web pour keep-alive
app.get("/", (req, res) => {
    res.send("✅ Bot en ligne et actif !");
});

app.listen(PORT, () => {
    console.log(`🌍 Serveur Express démarré sur le port ${PORT}`);
});

// Stockage des états
const clientStates = new Map();

// Création et connexion des clients
async function initializeClients() {
    // Vérifier qu'on a autant de tokens que de channels
    if (config.tokens.length !== config.voiceChannels.length) {
        console.error('❌ ERREUR: Le nombre de tokens et de channels doit être égal');
        process.exit(1);
    }

    for (let i = 0; i < config.tokens.length; i++) {
        const token = config.tokens[i];
        const channelId = config.voiceChannels[i];
        
        const client = new Client({ 
            checkUpdate: false,
            restRequestTimeout: 60000 // Augmente le timeout des requêtes
        });
        
        clients.push(client);
        clientStates.set(client, {
            channelId: channelId,
            attempts: 0,
            connected: false
        });

        client.on("ready", async () => {
            console.log(`🎮 ${client.user.username} prêt!`);
            await connectToVoice(client);
        });

        client.on("disconnect", () => {
            console.log(`🔌 ${client.user.username} déconnecté!`);
            clientStates.get(client).connected = false;
        });

        client.on("error", error => {
            console.error(`🚨 ERREUR sur ${client.user.username}:`, error.message);
        });

        try {
            await client.login(token);
        } catch (error) {
            console.error(`🔑 ERREUR DE LOGIN pour le token ${i+1}:`, error.message);
        }
    }
}

// Connexion vocale
async function connectToVoice(client) {
    const state = clientStates.get(client);
    
    if (state.connected || state.attempts >= config.voice.maxConnectionAttempts) {
        return;
    }

    state.attempts++;
    console.log(`🔍 [${client.user.username}] Tentative #${state.attempts} vers le salon ${state.channelId}...`);

    try {
        const channel = client.channels.cache.get(state.channelId);
        if (!channel) {
            throw new Error("Salon vocal introuvable");
        }

        // Configuration de la connexion avec timeout
        const connection = await Promise.race([
            client.voice.joinChannel(channel, {
                selfMute: config.voice.selfMute,
                selfDeaf: config.voice.selfDeaf,
                selfVideo: config.voice.selfVideo
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), config.voice.connectionTimeout)
        ]);

        state.connected = true;
        state.attempts = 0; // Réinitialiser les tentatives après succès
        
        console.log(`🎉 [${client.user.username}] Connecté au salon ${channel.name}!`);
        console.log(`🔊 Audio: Mute=${config.voice.selfMute} | Sourd=${config.voice.selfDeaf}`);

        // Gestion de la déconnexion
        connection.on('disconnect', () => {
            state.connected = false;
            console.log(`🔌 [${client.user.username}] Déconnecté du salon ${channel.name}`);
            setTimeout(() => connectToVoice(client), config.voice.retryDelay);
        });

    } catch (error) {
        console.error(`❌ [${client.user.username}] Erreur (tentative ${state.attempts}/${config.voice.maxConnectionAttempts}):`, error.message);
        
        if (state.attempts < config.voice.maxConnectionAttempts) {
            setTimeout(() => connectToVoice(client), config.voice.retryDelay);
        } else {
            console.error(`💀 [${client.user.username}] Abandon après ${config.voice.maxConnectionAttempts} tentatives`);
        }
    }
}

// Gestion des erreurs globales
process.on("unhandledRejection", error => {
    console.error("🚨 ERREUR (unhandledRejection):", error.message);
});

process.on("uncaughtException", error => {
    console.error("💥 CRASH (uncaughtException):", error);
    process.exit(1);
});

// Nettoyage avant arrêt
process.on('SIGINT', async () => {
    console.log("\n🔌 Déconnexion des clients...");
    for (const client of clients) {
        if (client.voice?.connection) {
            await client.voice.connection.disconnect().catch(() => {});
        }
        client.destroy();
    }
    process.exit();
});

// Démarrage
initializeClients();
