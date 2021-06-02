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

const donkRepliesPriority = ['g0ldfishbot', 'doo_dul', 'ron__bot']
const trusted = [ 'hackmagic' ]

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
	channels: [ 'swushwoi', 'ron__bot', 'ron__johnson_', 'hackmagic', 'minusinsanity', 'katelynerika', 'pepto__bismol', 'huwobot' ]
});

let channelsChatters = {};
let chattersRoles= {};

let lastMessageTimeStampMs = 0;
let lastSentMessage = '';

let lastChatterRefreshTimeStampMs = 0;

client.connect().catch(console.error);
client.on('message', (channel, tags, message, self) => {
	if(self) return;
	// refresh chatter list if needed
	getAllChatters();

	// ignore whispers for now
	if(tags['message-type'] === 'whisper') {
		console.log("ignored whisper");
		return;
	}
	let cleanMessage = message.replace(blankchar, '').trim();

	checkIfRaid(tags, cleanMessage);

	// console.log(tags);
	console.log(tags.emotes);
	
	
	if(cleanMessage.toLowerCase() === '&ping') {
		let timeSeconds = (Date.now() - startTimeStamp) / 1000;

		sendMessage(channel, `@${tags.username}, 👋 Okayeg running for ${prettySeconds(timeSeconds)}s`);
	}
	if(cleanMessage.toLowerCase() === '&code') {
		let timeSeconds = (Date.now() - startTimeStamp) / 1000;
		sendMessage(channel, `@${tags.username}, lidl code is here https://github.com/MagicHack/twitchbot`);
	}
	if(cleanMessage.toLowerCase() === '&tmi') {
		let timeSeconds = (Date.now() - startTimeStamp) / 1000;
		sendMessage(channel, `@${tags.username}, tmijs docs : https://github.com/tmijs/docs/tree/gh-pages/_posts/v1.4.2`);
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
		let sameRepliesChannel = [ '#hackmagic', '#pepto__bismol' ];
		let sameReplies = ['DinkDonk', 'YEAHBUTBTTV', 'TrollDespair', 'MODS', 'monkaE', 'POGGERS', 'VeryPog', 
		'MegaLUL FBBlock', 'hackerCD', ':)'];
		if(sameRepliesChannel.includes(channel)) {
			for(reply of sameReplies) {
				if(cleanMessage.startsWith(reply)) {
					sendMessage(channel, reply);
					break;
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
			if(cleanMessage.startsWith('&eval ')) {
				console.log("Eval monkaGIGA");
				let result = String(eval('(' + cleanMessage.substring('&eval '.length) + ')'));
				sendMessageRetry(channel, result);
			}
		}

		if(tags.emotes !== null) {
			channelEmotes(Object.keys(tags.emotes)).then((res) => {
				let cemotes = res;
				console.log(cemotes);
				/*
				if(channel === '#ron__bot') {
					sendMessageRetry(channel, String(cemotes));
				}
				if(channel === '#swushwoi' && cemotes.includes('xqcow')) {
					sendMessageRetry(channel, "MODS xqc emote detected MrDestructoid");
				}
				*/
			})
		}
	}
});

client.on("join", (channel, username, self) => {
	if(typeof channelsChatters[channel] === 'undefined') {
		getChatters(channel);
	}
});

function checkIfRaid(tags, message) {
	let notifyChannels = ['#minusinsanity', '#hackmagic'];
	let peopleToNotify = [ 'hackmagic', 'prog0ldfish'];
	if(tags.username === 'huwobot') {
		if(/A Raid Event at Level \[[0-9]+\] has appeared./.test(message)) {
			console.log("Raid detected");
			for(notifyChannel of notifyChannels) {
				let notifMessage = '';
				for(p of peopleToNotify) {
					if(channelsChatters[notifyChannel].includes(p)) {
						notifMessage += ' @' + p ;
					}
				}
				if(notifMessage.length !== 0) {
					sendMessageRetry(notifyChannel, 'DinkDonk +join' + notifMessage);
				} else {
					console.log("No one to notify Sadge");
				}
			}
		}
	}
}

// Retries to send messages if they fail
function sendMessageRetry(channel, message) {
	if(!sendMessage(channel, message)) {
		// retry after 300ms
		setTimeout(sendMessageRetry, 300, channel, message);
	}
}

// We assume normal bucket is full on start, maybe we it should be mod bucket?
let sentMessagesTS = new Array(rateLimitMessages).fill(Date.now());

function sendMessage(channel, message) {
	// TODO implement banphrase api

	// We implement rate limit as a sliding window, 
	// (last refill is now - 30seconds) to never go over the limit
	// We remove timestamps older then 30 second (+1 for safety margin)
	sentMessagesTS = sentMessagesTS.filter(ts => Date.now() - ts < (30 + 1) * 1000);
	let messageCounter = sentMessagesTS.length;

	let modSpamChannels = [ '#pepto__bismol' ]

	let isMod = false;
	if(typeof chattersRoles[channel].chatters.moderators !== 'undefined') {
		isMod = chattersRoles[channel].chatters.moderators.includes(client.getUsername());
	} else {
		console.log("Couldn't check role");
	}

	let modSpam = false;

	let currentRate = rateLimitDelay;
	let currentLimit = rateLimitMessages;

	if(isMod) {
		console.log("using mod rate limit");
		currentRate = rateLimitDelayMod;
		currentLimit = rateLimitMessagesMod;

		if(modSpamChannels.includes(channel)) {
			modSpam = true;
			console.log("Mod spam enabled TriHard");
		}
	}

	if(!modSpam && Date.now() - lastMessageTimeStampMs < currentRate * 1000) {
		// We send messages at most every 30s/ratelimit, another mesure to not go over the rate limit
		// except in channel where mod spam is enabled.
		console.log("Dropped message cause we are sending too fast");
		return false;
	} else {
		console.log("Current message counter is : " + messageCounter);

		if(messageCounter >= currentLimit * 0.8) {
			// We keep a margin of 20% to try to not get shadowbanned
			console.log("Dropped message cause we are approching max number of message every 30s");
			return false;
		}
		// We add the current timestamp to the sliding window
		sentMessagesTS.push(Date.now());
		lastMessageTimeStampMs = Date.now();

		// Add random char after to not trigger same message rejection
		if(lastSentMessage === message) {
			message += ' ' + blankchar;
		}
		lastSentMessage = message;
		client.say(channel, message);
		return true;
	}
}

function getAllChatters() {
	if(Date.now() - lastChatterRefreshTimeStampMs < delayChatterRefresh * 1000) {
		return;
	}
	lastChatterRefreshTimeStampMs = Date.now();
	console.log("Updating all channel chatters");

	let channels = client.getChannels();
	console.log(channels);
	channels.forEach(getChatters);

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

function prettySeconds(seconds) {
	// return a formatted string days, hours, minutes, seconds
	return new Date(1000 * seconds).toISOString().substr(11, 8).replace(/^[0:]+/, "");
}

function channelEmotes(emotes) {
	// check which channels emotes come from and return them
	let apiUrl = 'https://api.twitchemotes.com/api/v4/emotes?id='
	for(e of emotes) {
		apiUrl += e + ','
	}
	return new Promise((resolve, reject) => {
		let channels = [];
		let settings = { method: "Get" };
		fetch(apiUrl, settings)
		.then(res => res.json())
		.then((json) => {
			for(e of json) {
				channels.push(e['channel_name']);
			}
			return resolve(channels);
		})
	});
}
