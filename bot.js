require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const express = require('express');

// Configuration globale
const config = {
    // Liste des tokens Discord
    tokens: process.env.DISCORD_TOKENS.split(','),
    
    // Liste des channels vocaux
    voiceChannels: process.env.VOICE_CHANNELS.split(','),
    
    // Connexion vocale
    voice: {
        selfMute: false,
        selfDeaf: false,
        selfVideo: false,
        stayTime: 0,
        maxConnectionAttempts: 3,
        retryDelay: 20000,
        firstConnectionDelay: 30000, // 30 secondes pour la première connexion
        normalConnectionTimeout: 15000 // 15 secondes pour les tentatives suivantes
    }
};

// Initialisation
const clients = [];
const app = express();
const PORT = process.env.PORT || 3000;
const usedChannels = new Set(); // Pour suivre les salons déjà utilisés

// Serveur web pour keep-alive
app.get("/", (req, res) => {
    res.send("✅ Bot en ligne et actif !");
});

app.listen(PORT, () => {
    console.log(`🌍 Serveur Express démarré sur le port ${PORT}`);
});

// Fonction pour choisir un élément aléatoire dans un tableau qui n'a pas été utilisé
function getRandomUnusedChannel(array) {
    const availableChannels = array.filter(channel => !usedChannels.has(channel));
    if (availableChannels.length === 0) {
        // Si tous les salons sont utilisés, on réinitialise
        usedChannels.clear();
        return getRandomElement(array);
    }
    return getRandomElement(availableChannels);
}

function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// Création et connexion des clients
async function initializeClients() {
    for (const token of config.tokens) {
        const client = new Client({ checkUpdate: false });
        clients.push(client);
        
        client.on("ready", async () => {
            console.log(`\n🎮 ${client.user.username} prêt!`);
            await connectToVoice(client);
        });

        try {
            await client.login(token);
        } catch (error) {
            console.error(`🔑 ERREUR DE LOGIN pour un token:`, error.message);
        }
    }
}

// Variables d'état par client
const clientStates = new Map();

// Fonctionnalité de connexion vocale
async function connectToVoice(client) {
    if (!clientStates.has(client)) {
        clientStates.set(client, {
            attempts: 0,
            success: false,
            errors: [],
            startTime: null,
            connection: null,
            isFirstAttempt: true
        });
    }
    
    const voiceState = clientStates.get(client);
    const channelId = getRandomUnusedChannel(config.voiceChannels);
    
    voiceState.attempts++;
    voiceState.startTime = new Date();

    try {
        if (voiceState.attempts > config.voice.maxConnectionAttempts) {
            throw new Error(`Nombre maximum de tentatives (${config.voice.maxConnectionAttempts}) atteint`);
        }

        console.log(`🔍 [${client.user.username}] Tentative #${voiceState.attempts} de connexion au salon ${channelId}...`);
        const channel = client.channels.cache.get(channelId);

        if (!channel) throw new Error("Salon vocal introuvable");

        // Utiliser un timeout différent pour la première tentative
        const timeout = voiceState.isFirstAttempt ? config.voice.firstConnectionDelay : config.voice.normalConnectionTimeout;
        
        // Marquer le salon comme utilisé
        usedChannels.add(channelId);
        
        // Créer une promesse avec timeout
        const connectionPromise = client.voice.joinChannel(channel, {
            selfMute: config.voice.selfMute,
            selfDeaf: config.voice.selfDeaf,
            selfVideo: config.voice.selfVideo
        });

        // Ajouter un timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Connection not established within ${timeout/1000} seconds.`));
            }, timeout);
        });

        voiceState.connection = await Promise.race([connectionPromise, timeoutPromise]);

        voiceState.success = true;
        voiceState.isFirstAttempt = false;
        console.log(`\n🎉 [${client.user.username}] Connecté au salon ${channel.name}!`);
        console.log(`🔊 Audio: Mute=${config.voice.selfMute} | Sourd=${config.voice.selfDeaf} | Caméra: ${config.voice.selfVideo ? 'ON' : 'OFF'}`);

        if (config.voice.stayTime > 0) {
            console.log(`\n⏳ [${client.user.username}] Déconnexion dans ${config.voice.stayTime / 1000} secondes...`);
            setTimeout(() => disconnectFromVoice(client), config.voice.stayTime);
        }
    } catch (error) {
        // En cas d'erreur, libérer le salon utilisé
        usedChannels.delete(channelId);
        handleVoiceConnectionError(client, error);
    }
}

function handleVoiceConnectionError(client, error) {
    const voiceState = clientStates.get(client);
    
    voiceState.errors.push(error);
    console.error(`\n❌ [${client.user.username}] ERREUR (tentative ${voiceState.attempts}/${config.voice.maxConnectionAttempts}):`);
    console.error(`🔧 Détails: ${error.message}`);

    if (voiceState.attempts < config.voice.maxConnectionAttempts) {
        const delay = voiceState.isFirstAttempt ? config.voice.firstConnectionDelay : config.voice.retryDelay;
        console.log(`\n⌛ [${client.user.username}] Nouvelle tentative dans ${delay / 1000} secondes...`);
        setTimeout(() => connectToVoice(client), delay);
    } else {
        console.log(`\n💀 [${client.user.username}] Échec après plusieurs tentatives.`);
    }
}

async function disconnectFromVoice(client) {
    const voiceState = clientStates.get(client);
    
    try {
        if (!voiceState.connection) return;

        console.log(`\n🔌 [${client.user.username}] Déconnexion...`);
        await voiceState.connection.disconnect();
        usedChannels.delete(voiceState.connection.channelId); // Libérer le salon

        const sessionTime = Math.round((new Date() - voiceState.startTime) / 1000);
        console.log(`\n✅ [${client.user.username}] Session terminée après ${sessionTime} secondes`);
        console.log(`📊 Stats: ${voiceState.success ? "SUCCÈS" : "ÉCHEC"} | Tentatives: ${voiceState.attempts}`);
    } catch (error) {
        console.error(`❌ [${client.user.username}] Erreur de déconnexion:`, error.message);
    }
}

// Gestion des erreurs globales
process.on("unhandledRejection", (error) => {
    if (error.message.includes("VOICE_CONNECTION_TIMEOUT")) {
        console.log("⚠️ Timeout détecté mais la connexion peut continuer");
        return;
    }
    console.error("🚨 ERREUR:", error);
});

process.on("uncaughtException", (error) => {
    console.error("💥 CRASH:", error);
    process.exit(1);
});

// Démarrage
initializeClients();
