const fetch = require('node-fetch');
const tmi = require('tmi.js');
const fs = require('fs');

// Number of message that can be sent every 30 seconds
const rateLimitMessages = 20; 
const rateLimitMessagesMod = 100;

// Minimum time in between messages to no go over rate limit
const rateLimitDelay = 30 / rateLimitMessages;
const rateLimitDelayMod = 30 / rateLimitMessagesMod;

// Time between chatter fetch
const delayChatterRefresh = 120;

// Weird char in twitch messages
const blankchar = '󠀀';

const configFilePath = 'config.json';

const startTimeStamp = Date.now();

let username = '';
let password = '';

try {
	const data = fs.readFileSync(configFilePath, 'utf8')
	configData = JSON.parse(data);
	username = configData["username"];
	password = configData["token"];
} catch (err) {
	console.error(err);
	console.log("Error, could not read config file. Quitting");
	return 1;
}

const donkRepliesPriority = ['magichack_', 'g0ldfishbot', 'doo_dul']
const trusted = [ 'ron__johnson_' ]

const client = new tmi.Client({
	options: { debug: true, messagesLogLevel: "info" },
	connection: {
		reconnect: true,
		secure: true
	},
	identity: {
		username: username,
		password: password
	},
	channels: [ 'ron__bot', 'ron__johnson_']
});

let channelsChatters = {};
let chattersRoles= {};

let lastMessageTimeStampMs = 0;
let lastSentMessage = '';

let lastChatterRefreshTimeStampMs = 0;

client.connect().catch(console.error);
client.on('message', (channel, tags, message, self) => {
	// refresh chatter list if needed
	getAllChatters();

	// ignore whispers for now
	if(tags['message-type'] === 'whisper') {
		console.log("ignored whisper");
		return;
	}

	let cleanMessage = message.replace(blankchar, '').trim();
	if(self) return;
	if(cleanMessage.toLowerCase() === '&ping') {
		let timeSeconds = (Date.now() - startTimeStamp) / 1000;
		sendMessage(channel, `@${tags.username}, 👋 Okayeg running for ${timeSeconds.toFixed(2)}s`);
	}
	if(cleanMessage.toLowerCase() === '&code') {
		let timeSeconds = (Date.now() - startTimeStamp) / 1000;
		sendMessage(channel, `@${tags.username}, lidl code is here https://github.com/MagicHack/twitchbot`);
	}
	
	if(tags.username !== client.getUsername()) {
		let channelsNoPriority = [ '#pepto__bismol'];
		donkUsername = '';
		if(!channelsNoPriority.includes(channel)) {
			for(donk of donkRepliesPriority) {
				if(typeof channelsChatters[channel] !== 'undefined') {
					if(channelsChatters[channel].includes(donk)) {
						donkUsername = donk;
						break;
					}
				} else {
					console.log("chatter list not present yet");
				}
			}
		}

		if(donkUsername === '' || tags.username === donkUsername){
			if(cleanMessage.startsWith('TeaTime FeelsDonkMan')) {
				sendMessage(channel, `FeelsDonkMan TeaTime`);
			}
			if(cleanMessage.startsWith('FeelsDonkMan TeaTime')) {
				sendMessage(channel, `TeaTime FeelsDonkMan`);
			}
		}
		let sameRepliesChannel = [ '#hackmagic', '#minusinsanity', '#pepto__bismol' ];
		let sameReplies = ['DinkDonk', 'YEAHBUTBTTV', 'TrollDespair', 'MODS', 'monkaE', 'POGGERS', 'VeryPog', 
		'MegaLUL FBBlock', 'hackerCD', ':)'];
		if(sameRepliesChannel.includes(channel)) {
			for(reply of sameReplies) {
				if(cleanMessage.startsWith(reply)) {
					sendMessage(channel, reply);
					return;
				}
			}
		}
		
		if(trusted.includes(tags.username) && cleanMessage.startsWith('&say ')) {
			sendMessage(channel, cleanMessage.substring(5));
		}

		if(trusted.includes(tags.username)) {
			// whisper, todo
			if(cleanMessage.startsWith('&w ')) {
				// = cleanMessage.substring(3).split(' ');
			}
		}

	}
});

client.on("join", (channel, username, self) => {
    getChatters(channel);
});

let modSpamMessageCounter = 0;
let modSpamCounterTimeStampMs = 0;

function sendMessage(channel, message) {
	// TODO implement banphrase api
	// Currently we treat the rate limit as global...
	// TODO, implement per channel and mod/vip rate limit
	let modSpamChannels = [ '#pepto__bismol' ]

	let isMod = false;
	if(typeof chattersRoles[channel].chatters.moderators !== 'undefined') {
		isMod = chattersRoles[channel].chatters.moderators.includes(client.getUsername());
	} else {
		console.log("Couldn't check role");
	}
	let modSpam = false;
	let currentRate = rateLimitDelay;

	if(isMod) {
		console.log("using mod rate limit");
		currentRate = rateLimitDelayMod;
		if(modSpamChannels.includes(channel)) {
			modSpam = true;
			console.log("Mod spam enabled TriHard");
		}
	}

	if(!modSpam && Date.now() - lastMessageTimeStampMs < currentRate * 1000) {
		console.log("Dropped message cause of rate limit Sadge");
		return;
	} else {
		if(modSpam) {
			if(Date.now() - modSpamCounterTimeStampMs > 30 * 1000) {
				modSpamMessageCounter = 0;
				modSpamCounterTimeStampMs = Date.now();
			}
			if(modSpamMessageCounter >= rateLimitMessagesMod - 5) {
				// We keep a margin of a few messages to try to not get shadowbanned
				console.log("Dropped cause of mod rate limit Sadeg");
				return;
			} else {
				modSpamMessageCounter++;
			}
		}
		lastMessageTimeStampMs = Date.now();
		// Add random char after to not trigger same message protection
		if(lastSentMessage === message) {
			message += ' ' + blankchar;
		}
		lastSentMessage = message;
		client.say(channel, message);
	}
}

function getAllChatters() {
	if(Date.now() - lastChatterRefreshTimeStampMs < delayChatterRefresh * 1000) {
		return;
	}
	lastChatterRefreshTimeStampMs = Date.now();
	console.log("Updating all channel chatters");

	channels = [];

	// Remove duplicates, still weird mutliple refresh in a row FeelsDankMan
	for(c of client.getChannels()) {
		if(!channels.includes(c)) {
			channels.push(c);
		}
	}

	for(channelName of channels) {
		getChatters(channelName);	
	}
}

function getChatters(channelName) {
	console.log("Updating chatter list for " + channelName);
	let url = `https://tmi.twitch.tv/group/user/${channelName.substring(1)}/chatters`

	let settings = { method: "Get" };
	let chatters = []
	fetch(url, settings)
	.then(res => res.json())
	.then((json) => {
		// console.log(json);
		// do something with JSON
		for(c of json.chatters.broadcaster) {
			chatters.push(c);
		}
		for(c of json.chatters.vips) {
			chatters.push(c);
		}
		for(c of json.chatters.moderators) {
			chatters.push(c);
		}
		for(c of json.chatters.staff) {
			chatters.push(c);
		}
		for(c of json.chatters.global_mods) {
			chatters.push(c);
		}
		for(c of json.chatters.admins) {
			chatters.push(c);
		}
		for(c of json.chatters.viewers) {
			chatters.push(c);
		}
		channelsChatters[channelName] = chatters;
		chattersRoles[channelName] = json;
	});
}