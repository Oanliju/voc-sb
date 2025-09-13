const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST, ActivityType } = require('discord.js');
const { channel } = require('diagnostics_channel');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID; // Optionnel : pour les commandes slash en mode dev

// Configuration des compteurs
const counters = [
    { type: 'all', name: '👥 Membres Totaux', format: count => `👥・Membres: ${count}` },
    { type: 'online', name: '🟢 En Ligne', format: count => `🟢・En ligne: ${count}` },
    { type: 'bots', name: '🤖 Bots', format: count => `🤖・Bots: ${count}` },
    { type: 'voice', name: '🔊 En Vocal', format: count => `🔊・En vocal: ${count}` }
];

// Stockage des IDs des salons de compteur
let counterChannels = {};

// Commandes Slash
const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure les salons de compteur')
        .addChannelOption(option =>
            option.setName('category')
                .setDescription('Catégorie où créer les salons')
                .setRequired(true))
].map(command => command.toJSON());

// Enregistrement des commandes
const rest = new REST({ version: '10' }).setToken(token);
rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands })
    .then(() => console.log('Commandes enregistrées.'))
    .catch(console.error);

client.once('ready', () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    client.user.setActivity('📊 Compter les membres', { type: ActivityType.Watching });

    // Met à jour les compteurs toutes les 15 minutes (900000 ms)
    setInterval(updateCounters, 900000);
    updateCounters();
});

// Fonction pour mettre à jour tous les compteurs
async function updateCounters() {
    const guild = client.guilds.cache.first(); // Prend la première guilde
    if (!guild) return;

    await guild.members.fetch(); // Met en cache les membres
    await guild.channels.fetch(); // Met en cache les salons

    // Calcul des statistiques
    const totalMembers = guild.memberCount;
    const onlineMembers = guild.members.cache.filter(m => m.presence?.status === 'online' || m.presence?.status === 'idle' || m.presence?.status === 'dnd').size;
    const bots = guild.members.cache.filter(m => m.user.bot).size;
    const inVoice = guild.members.cache.filter(m => m.voice.channel).size;

    const stats = {
        all: totalMembers,
        online: onlineMembers,
        bots: bots,
        voice: inVoice
    };

    // Met à jour les salons
    for (const [type, channelId] of Object.entries(counterChannels)) {
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
            const format = counters.find(c => c.type === type)?.format;
            if (format) {
                channel.setName(format(stats[type])).catch(console.error);
            }
        }
    }
}

// Gestionnaire de commandes slash
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'setup') {
        const category = interaction.options.getChannel('category');
        if (category.type !== ChannelType.GuildCategory) {
            return interaction.reply({ content: 'Veuillez sélectionner une catégorie valide.', ephemeral: true });
        }

        // Crée les salons de compteur
        for (const counter of counters) {
            const channelName = counter.format(0); // Format initial avec 0
            const channel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: category.id,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.Connect] // Empêche la connexion vocale
                    }
                ]
            });
            counterChannels[counter.type] = channel.id;
        }

        await interaction.reply({ content: '✅ Configuration terminée ! Les salons ont été créés.', ephemeral: true });
        updateCounters();
    }
});

client.login(token);
