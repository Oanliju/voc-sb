require("dotenv").config();
const express = require("express");
const { Client } = require("discord.js-selfbot-v13");
const client = new Client({ checkUpdate: false });

const app = express();
const PORT = process.env.PORT || 3000;

// --- Petit serveur pour Render ---
app.get("/", (req, res) => {
  res.send("✅ Bot en ligne et actif !");
});

app.listen(PORT, () => {
  console.log(`🌍 Serveur Express démarré sur le port ${PORT}`);
});

// Configuration avec option caméra désactivée par défaut
const config = {
    token: process.env.DISCORD_TOKEN,
    voiceChannelId: "1398387735181656094",
    selfMute: false,
    selfDeaf: false,
    selfVideo: false, // Caméra désactivée par défaut
    stayTime: 0,
    maxConnectionAttempts: 3,
    retryDelay: 20000,
};

// Statistiques
const stats = {
    attempts: 0,
    success: false,
    errors: [],
    startTime: null,
    voiceConnection: null,
};

client.on("ready", async () => {
    console.log(`\n🎮 ${client.user.username} prêt!`);
    await connectToVoice();
});

async function connectToVoice() {
    stats.attempts++;
    stats.startTime = new Date();

    try {
        if (stats.attempts > config.maxConnectionAttempts) {
            throw new Error(
                `Nombre maximum de tentatives (${config.maxConnectionAttempts}) atteint`,
            );
        }

        console.log(
            `🔍 Tentative #${stats.attempts} de connexion au salon ${config.voiceChannelId}...`,
        );
        const channel = client.channels.cache.get(config.voiceChannelId);

        if (!channel) throw new Error("Salon vocal introuvable");

        // Connexion avec option caméra (désactivée par défaut)
        stats.voiceConnection = await client.voice.joinChannel(channel, {
            selfMute: config.selfMute,
            selfDeaf: config.selfDeaf,
            selfVideo: config.selfVideo // Option caméra
        });

        stats.success = true;
        console.log(`\n🎉 Connecté au salon ${channel.name}!`);
        console.log(
            `🔊 Audio: Mute=${config.selfMute} | Sourd=${config.selfDeaf} | Caméra: ${config.selfVideo ? 'ON' : 'OFF'}`
        );

        if (config.stayTime > 0) {
            console.log(
                `\n⏳ Déconnexion dans ${config.stayTime / 1000} secondes...`,
            );
            setTimeout(disconnectFromVoice, config.stayTime);
        }
    } catch (error) {
        handleConnectionError(error);
    }
}

function handleConnectionError(error) {
    stats.errors.push(error);
    console.error(
        `\n❌ ERREUR (tentative ${stats.attempts}/${config.maxConnectionAttempts}):`,
    );
    console.error(`🔧 Détails: ${error.message}`);

    if (stats.attempts < config.maxConnectionAttempts) {
        console.log(
            `\n⌛ Nouvelle tentative dans ${config.retryDelay / 1000} secondes...`,
        );
        setTimeout(connectToVoice, config.retryDelay);
    } else {
        console.log("\n💀 Échec après plusieurs tentatives. Arrêt...");
        process.exit(1);
    }
}

async function disconnectFromVoice() {
    try {
        if (!stats.voiceConnection) return;

        console.log("\n🔌 Déconnexion...");
        await stats.voiceConnection.disconnect();

        const sessionTime = Math.round((new Date() - stats.startTime) / 1000);
        console.log(`\n✅ Session terminée après ${sessionTime} secondes`);
        console.log(
            `📊 Stats: ${stats.success ? "SUCCÈS" : "ÉCHEC"} | Tentatives: ${stats.attempts}`,
        );
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
