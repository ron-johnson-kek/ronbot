const fetch = require('node-fetch');
const tmi = require('tmi.js');
const fs = require('fs');
const mysql = require('mysql'); 
const sfetch = require('sync-fetch')
 
const metadata = sfetch('https://doi.org/10.7717/peerj-cs.214', {
  headers: {
    Accept: 'application/vnd.citationstyles.csl+json'
  }
}).json()

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
let mysqlPassword = '';
let weatherAPIkey = '';

try {
	const data = fs.readFileSync(configFilePath, 'utf8')
	configData = JSON.parse(data);
	username = configData["username"];
	password = configData["token"];
	mysqlPassword = configData["mysqlPassword"];
	weatherAPIkey = configData["weatherAPIkey"];
} catch (err) {
	console.error(typeof err + " " + err.message);
	console.error(err);
	console.log("Error, could not read config file. Quitting");
	return 1;
}

//MYSQL Import
var con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: mysqlPassword 
});

con.connect(function(err) {
  if (err) throw err;
  console.log("Connected!");
});

const donkRepliesPriority = ['magichack_']
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
	channels: [ 'ron__bot', 'ron__johnson_','minusinsanity','pepto__bismol']
});

let channelsChatters = {};
let chattersRoles= {};

setInterval(getAllChatters, delayChatterRefresh * 1000);
let lastMessageTimeStampMs = 0;
let lastSentMessage = '';

let lastChatterRefreshTimeStampMs = 0;

client.connect().catch(console.error);
client.on('message', (channel, tags, message, self) => {
	if(self) return;
	// refresh chatter list if needed
	getAllChatters();
	
	let cleanMessage = message.replace(blankchar, '').trim();

	// ignore whispers for now
	if(tags['message-type'] === 'whisper') {
		console.log("ignored whisper");
		return;
	}

	if(cleanMessage.toLowerCase() === '-ping') {
		let timeSeconds = (Date.now() - startTimeStamp) / 1000;
		sendMessage(channel, `@${tags.username}, 👋 FeelsDankMan running for ${timeSeconds.toFixed(2)}s`);
	}
	if(cleanMessage.toLowerCase() === '-code') {
		let timeSeconds = (Date.now() - startTimeStamp) / 1000;
		sendMessage(channel, `@${tags.username}, code can be found here https://github.com/ron-johnson-kek/ronbot`);
	}
	
	if(trusted.includes(tags.username) && cleanMessage.startsWith('-weather ')) {
		let cityname = cleanMessage.substring(9);
		let weatherDataTest = sfetch(`http://api.openweathermap.org/data/2.5/weather?q=${cityname}&units=metric&&appid=${weatherAPIkey}`, { }).json().main.temp + "°C"
	
		sendMessage(channel, `${weatherDataTest}` + ` ${cityname}` )
	}
	
	if(trusted.includes(tags.username) && cleanMessage.startsWith('test')) {
		sendMessage(channel, 'gachiHop test complete gachiHop')
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
		let sameRepliesChannel = [ '#ron__johnson_','#minusinsanity'];
		let sameReplies = ['MegaLUL FBBlock'];
		if(sameRepliesChannel.includes(channel)) {
			for(reply of sameReplies) {
				if(cleanMessage.startsWith(reply)) {
					sendMessage(channel, reply);
					break;
				}
			}
		}
		
		if(trusted.includes(tags.username) && cleanMessage.startsWith('-say ')) {
			sendMessage(channel, cleanMessage.substring(5));
		}
		
		if(trusted.includes(tags.username)) {
			// whisper, todo
			if(cleanMessage.startsWith('-w ')) {
				// = cleanMessage.substring(3).split(' ');
			}
			if(message.startsWith('-eval ')) {
				console.log("Eval monkaS");
				try {
					let result = String(eval('(' + cleanMessage.substring('&eval '.length) + ')'));
					sendMessageRetry(channel, result);
				  } catch (e) {
					console.error(e.message);
					sendMessageRetry(channel, "Eval failed, check console for details.");
				  }
			}
		}
		
	}
});

client.on("join", (channel, username, self) => {
    if(typeof channelsChatters[channel] === 'undefined') {
		getChatters(channel);
	}
});

let modSpamMessageCounter = 0;
let modSpamCounterTimeStampMs = 0;

// Retries to send messages if they fail
function sendMessageRetry(channel, message) {
	if(!sendMessage(channel, message)) {
		// retry after 300ms
		setTimeout(sendMessageRetry, 300, channel, message);
	}
}

let sentMessagesTS = [];

function sendMessage(channel, message) {
	// TODO implement banphrase api
	// Currently we treat the rate limit as global...
	// TODO, implement per channel and mod/vip rate limit
	sentMessagesTS = sentMessagesTS.filter(ts => Date.now() - ts < (30 + 1) * 1000);
	let messageCounter = sentMessagesTS.length;
	
	let modSpamChannels = [ '#ron__bot' ]

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
		console.log("Dropped message cause of rate limit Sadge");
		return false;
	} else {
		console.log("Current message counter is : " + messageCounter);

		if(messageCounter >= currentLimit * 0.8) {
			// We keep a margin of 20% to try to not get shadowbanned
			console.log("Dropped message cause we are approching max number of message every 30s");
			return false;
		}
		sentMessagesTS.push(Date.now());
		lastMessageTimeStampMs = Date.now();
		// Add random char after to not trigger same message protection
		if(lastSentMessage === message) {
			message += ' ' + blankchar;
		}
		lastSentMessage = message;
		client.say(channel, message);
		return true;
	}
}

function getAllChatters() {
	console.log("Dispatching chatters updates");
	if(Date.now() - lastChatterRefreshTimeStampMs < delayChatterRefresh * 1000) {
		return;
	}
	lastChatterRefreshTimeStampMs = Date.now();
	console.log("Updating all channel chatters");

	let channels = client.getChannels();
	// channels.forEach(getChatters);
	// delay each channel refresh to space them out in the delay
	let delay = delayChatterRefresh / channels.length;
	for(i in channels) {
		cDelay = i * delay;
		console.log("Updating chatters for " + channels[i] + " in " + cDelay.toFixed(2) + "s");
		setTimeout(getChatters, cDelay * 1000, channels[i]);
	}
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
		}).catch((error) => {
		console.error("Failed to get chatters list from tmi");
		console.error(typeof error + " " + error.message);
	});
}

function prettySeconds(seconds) {
	// return a formatted string days, hours, minutes, seconds
	return new Date(1000 * seconds).toISOString().substr(11, 8).replace(/^[0:]+/, "");
}
