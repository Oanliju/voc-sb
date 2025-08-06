require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const express = require('express');

// Configuration globale
const config = {
    // Discord
    token: process.env.DISCORD_TOKEN,
    
    // Connexion vocale
    voice: {
        channelId: "1398387735181656094",
        selfMute: false,
        selfDeaf: false,
        selfVideo: false,
        stayTime: 0,
        maxConnectionAttempts: 3,
        retryDelay: 20000
    }
};

// Initialisation
const client = new Client({ checkUpdate: false });
const app = express();
const PORT = process.env.PORT || 3000;

// Serveur web pour keep-alive
app.get("/", (req, res) => {
    res.send("✅ Bot en ligne et actif !");
});

app.listen(PORT, () => {
    console.log(`🌍 Serveur Express démarré sur le port ${PORT}`);
});

// Variables d'état
const state = {
    voice: {
        attempts: 0,
        success: false,
        errors: [],
        startTime: null,
        connection: null
    }
};

// Événements du client Discord
client.on("ready", async () => {
    console.log(`\n🎮 ${client.user.username} prêt!`);
    await connectToVoice();
});

// Fonctionnalité de connexion vocale
async function connectToVoice() {
    const { voice } = config;
    const voiceState = state.voice;
    
    voiceState.attempts++;
    voiceState.startTime = new Date();

    try {
        if (voiceState.attempts > voice.maxConnectionAttempts) {
            throw new Error(`Nombre maximum de tentatives (${voice.maxConnectionAttempts}) atteint`);
        }

        console.log(`🔍 Tentative #${voiceState.attempts} de connexion au salon ${voice.channelId}...`);
        const channel = client.channels.cache.get(voice.channelId);

        if (!channel) throw new Error("Salon vocal introuvable");

        voiceState.connection = await client.voice.joinChannel(channel, {
            selfMute: voice.selfMute,
            selfDeaf: voice.selfDeaf,
            selfVideo: voice.selfVideo
        });

        voiceState.success = true;
        console.log(`\n🎉 Connecté au salon ${channel.name}!`);
        console.log(`🔊 Audio: Mute=${voice.selfMute} | Sourd=${voice.selfDeaf} | Caméra: ${voice.selfVideo ? 'ON' : 'OFF'}`);

        if (voice.stayTime > 0) {
            console.log(`\n⏳ Déconnexion dans ${voice.stayTime / 1000} secondes...`);
            setTimeout(disconnectFromVoice, voice.stayTime);
        }
    } catch (error) {
        handleVoiceConnectionError(error);
    }
}

function handleVoiceConnectionError(error) {
    const { voice } = config;
    const voiceState = state.voice;
    
    voiceState.errors.push(error);
    console.error(`\n❌ ERREUR (tentative ${voiceState.attempts}/${voice.maxConnectionAttempts}):`);
    console.error(`🔧 Détails: ${error.message}`);

    if (voiceState.attempts < voice.maxConnectionAttempts) {
        console.log(`\n⌛ Nouvelle tentative dans ${voice.retryDelay / 1000} secondes...`);
        setTimeout(connectToVoice, voice.retryDelay);
    } else {
        console.log("\n💀 Échec après plusieurs tentatives. Arrêt...");
        process.exit(1);
    }
}

async function disconnectFromVoice() {
    const voiceState = state.voice;
    
    try {
        if (!voiceState.connection) return;

        console.log("\n🔌 Déconnexion...");
        await voiceState.connection.disconnect();

        const sessionTime = Math.round((new Date() - voiceState.startTime) / 1000);
        console.log(`\n✅ Session terminée après ${sessionTime} secondes`);
        console.log(`📊 Stats: ${voiceState.success ? "SUCCÈS" : "ÉCHEC"} | Tentatives: ${voiceState.attempts}`);
    } catch (error) {
        console.error("❌ Erreur de déconnexion:", error.message);
    } finally {
        process.exit(0);
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
client.login(config.token).catch((error) => {
    console.error("🔑 ERREUR DE LOGIN:", error.message);
    process.exit(1);
});
