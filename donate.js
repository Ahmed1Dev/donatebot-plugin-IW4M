// Donate Bot IW4M Plugin
// Tested on IW4M Version 2.3 Prerelease Feature 2 Build 199

const config = {
    apiKey: "Your Donate Bot API Key",
    serverID: "The server ID where you are selling this product.",
    // In minutes, how often to check for donations
    checkEvery: 5,
    // The product ID, see https://developers.donatebot.io/plugins/plugin-iw4m-admin for more information.
    productID: "",
    // This is the "Custom Variable Name" you entered under the product inside the Donate Bot Panel
    customIDKey: "Your In-Game ID",
    // If the plugin should announce donators on join.
    donatorJoinMessage: true,
    // If the plugin should give the "Trusted" role to donators.
    donatorGiveTrusted: true,
    // Send a message to a discord webhook with a message regarding the donation.
    enableDiscordWebhook: false,
    // Create a webhook in the channel you want and place the URL here.
    discordWebhookURL: ""
}

// Configurable language for the plugin
const language = {
    // The message returned when the user uses the donate command. 
    cmdDonate: "Donate at discord.gg/myID. Enter the following in game ID at checkout: {{client_id}}",
    // The message returned if the user is a donator.
    cmdDonator: "You are a ^3Donator^7! Thank you very much for your contribution to the server.",
    // The message returned if the user is not a donator on the server.
    cmdNotDonator: "You are not a ^3Donator^7. Type {{donate_cmd}} or {{donate_cmd_alias}} to donate.",
    // If the user is connected while they donated, this message will be sent.
    onDonate: "Thanks for your donation to the server!",
    // When a donator joins the server this message will be broadcast to everyone in the server.
    donatorJoin: "Thank you for being a ^3Donator ^5{{client_name}}^7!",
    // The body of the webhook if you have it enabled.
    webhookBody: "Thank you <@{{discord_id}}> ({{client_name}}) for your donation on our Call of Duty servers!"
}

//
// No further configuration is required below this line
//

let commands = [{
    name: "donate",
    description: "Get the donation link for the server.",
    alias: "d",
    permission: "User",
    execute: (gameEvent) => {
        var output = plugin.templateParser(language.cmdDonate, {client_id: gameEvent.Origin.ClientId});
        gameEvent.Origin.Tell(output);
    }
},
{
    name: "donatestatus",
    description: "Get your donation status for the server.",
    alias: "dstatus",
    permission: "User",
    execute: (gameEvent) => {

        var status = plugin.getDonationStatus(gameEvent.Origin);

        if (status) {
            var output = plugin.templateParser(language.cmdDonator, {});
            gameEvent.Origin.Tell(output);
        } else {
            var output = plugin.templateParser(language.cmdNotDonator, {donate_cmd: commands[0].name, donate_cmd_alias: commands[0].alias});
            gameEvent.Origin.Tell(output)
        }

    }
},
{
    name: "setdonatestatus",
    description: "Manually apply or remove a donator's status.",
    alias: "dset",
    permission: "Administrator",
    targetRequired: true,
    arguments: [
        {
            name: "status",
            required: true
        }
    ],
    execute: (gameEvent) => {
        var status = gameEvent.Data.split(' ')[0];
        var clientId = gameEvent.Target.ClientId;
        if (status === "1" || status === "True" || status === "true") {
            plugin.applyNewDonation(clientId);
            gameEvent.Origin.Tell(`>>>  ✅ **Status ${gameEvent.Target.Name} Changed To \`True\`.**`);
        } else if (status === "0" || status === "False" || status === "false") {
            plugin.removeDonationReward(clientId);
            gameEvent.Origin.Tell(`>>> ✅ **Status ${gameEvent.Target.Name} Changed To \`False\`.`);
        } else {
            gameEvent.Origin.tell(">>> :X: **if you want opend choose \`true\`, if you want closed choose \`false\`** ")
        }
    }
}];

var nextTime;
const baseURL = "https://donatebot.io/api/v1"

let plugin = {
    author: 'Donate Bot',
    version: 1.0,
    name: 'Accept donations on your server.',

    templateParser: function (expression, valueObj) {
        const templateMatcher = /{{\s?([^{}\s]*)\s?}}/g;
        let text = expression.replace(templateMatcher, (substring, value, index) => {
            value = valueObj[value];
            return value;
        });
        return text
    },

    sendDiscordWebhook: function(clientID, buyerID) {
        if (config.enableDiscordWebhook && typeof config.discordWebhookURL === "string" && config.discordWebhookURL !== "") {
             try {
                var owner = this.manager.GetClientService().Get(clientID).Result

                var output = this.templateParser(language.webhookBody, {client_name: owner.Name, discord_id: buyerID});

                var cl = new System.Net.Http.HttpClient();
                var re = cl.PostAsync(config.discordWebhookURL, new System.Net.Http.StringContent(JSON.stringify({content: output}), System.Text.Encoding.UTF8, "application/json")).Result;
                var co = re.Content;

                co.Dispose();
                re.Dispose();
                cl.Dispose();
            } catch (e) {
                this.logger.WriteWarning('There was a problem sending a Discord webhook ' + e.message);
            }
        }
    },

    getDonationStatus: function(owner) {
         try {
             var data = this.metaService.GetPersistentMeta("dbplugin_data", owner).Result.Value;
             data = JSON.parse(data);
             if (data.isDonator === true) {
                 return true;
             }
         } catch (e) {
             return false;
         }
    },

    setDonationStatus: function(owner, status) {
        try {
            var data = this.metaService.GetPersistentMeta("dbplugin_data", owner).Result.Value;
            data = JSON.parse(data);
            data.isDonator = status;
            this.metaService.AddPersistentMeta("dbplugin_data", JSON.stringify(data), owner).Result

        } catch (e) {
            this.metaService.AddPersistentMeta("dbplugin_data", JSON.stringify({isDonator: true}), owner).Result
        }
    },

    onJoin: function(gameEvent, server) {
        if (!config.donatorJoinMessage) {
            return;
        }

        // When a user joins, check if they are a donator
        var isDonator = this.getDonationStatus(gameEvent.Origin);
        if (isDonator) {
            var output = this.templateParser(language.donatorJoin, {client_name: gameEvent.Origin.Name})
            gameEvent.Owner.Broadcast(output);
        }
    },

    getNextTime: function() {
        var date = new Date();
        nextTime = date.setMinutes(date.getMinutes() + config.checkEvery);
    },

    applyNewDonation: function(clientID) {
        try {
            var owner = this.manager.GetClientService().Get(clientID).Result
            if (config.donatorGiveTrusted && owner.Level < 2) {
                owner.SetLevel(clientID, _IW4MAdminClient);
            }

            this.setDonationStatus(owner, true);

            var clients = this.manager.GetActiveClients();
            clients.forEach(x => {
                // Sent a donation message if the user is in the server
                if (x.ClientId == clientID) {
                    x.Tell(language.onDonate);
                }
            });
        } catch (e) {
            // The user's ID may have been invalid that they entered at checkout
        }

    },

    removeDonationReward: function(clientID) {
        try {
            // Remove the trusted role from the user
            var owner = this.manager.GetClientService().Get(clientID).Result
            this.setDonationStatus(owner, false);

            if (config.donatorGiveTrusted && owner.Level <= 2) {
                owner.SetLevel(0, _IW4MAdminClient);
            }
        } catch (e) {
            // The user's ID may have been invalid that they entered at checkout
        }
    },

    markAsProcessed: function(txn_id, isEndedSubscription) {
        try {
            var cl = new System.Net.Http.HttpClient();
            cl.DefaultRequestHeaders.Add("Authorization", config.apiKey);
            cl.DefaultRequestHeaders.Add("User-Agent", "Donate-Bot-IW4M-Plugin/" + this.version.toFixed(1));
            var re = cl.PostAsync(baseURL + "/donations/" + config.serverID + "/" + txn_id + "/mark", new System.Net.Http.StringContent(JSON.stringify({markProcessed: true, isEndedSubscription}), System.Text.Encoding.UTF8, "application/json")).Result;
            var co = re.Content;
            var parsedJSON = JSON.parse(co.ReadAsStringAsync().Result);

            co.Dispose();
            re.Dispose();
            cl.Dispose();
        } catch (e) {
            this.logger.WriteWarning('There was a problem marking a donation as processed ' + e.message);
        }
    },

    checkForEndedSubcriptions() {
        var endedSubscriptions = [];

        try {
            var cl = new System.Net.Http.HttpClient();
            cl.DefaultRequestHeaders.Add("Authorization", config.apiKey);
            cl.DefaultRequestHeaders.Add("User-Agent", "Donate-Bot-IW4M-Plugin/" + this.version.toFixed(1));
            var re = cl.GetAsync(baseURL + "/donations/" + config.serverID + "/endedsubscriptions").Result;
            var co = re.Content;
            var fetched = JSON.parse(co.ReadAsStringAsync().Result);
            co.Dispose();
            re.Dispose();
            cl.Dispose();

            for (var i = 0; i < fetched.endedSubscriptions.length; i++) {
                var donation = fetched.endedSubscriptions[i];

                if (donation.product_id !== config.productID) {
                    continue;
                }

                if (!donation.seller_customs[config.customIDKey]) {
                    return;
                }

                var clientID = parseInt(donation.seller_customs[config.customIDKey]);

                this.removeDonationReward(clientID);
                this.markAsProcessed(donation.txn_id, true);
            }

        } catch (e) {
            this.logger.WriteWarning('There was a problem fetching ended subscriptions ' + e.message);
        }
    },

    checkForDonations: function() {

        var donations = [];

        try {
        
            var cl = new System.Net.Http.HttpClient();
            cl.DefaultRequestHeaders.Add("Authorization", config.apiKey);
            cl.DefaultRequestHeaders.Add("User-Agent", "Donate-Bot-IW4M-Plugin/" + this.version.toFixed(1));
            var re = cl.GetAsync(baseURL + "/donations/" + config.serverID + "/new?find=Completed,Reversed,Refunded").Result;
            var co = re.Content;
            var fetched = JSON.parse(co.ReadAsStringAsync().Result);
            co.Dispose();
            re.Dispose();
            cl.Dispose();

            for (var i = 0; i < fetched.donations.length; i++) {
                var donation = fetched.donations[i];

                if (donation.product_id !== config.productID) {
                    continue;
                }

                if (!donation.seller_customs[config.customIDKey]) {
                    return;
                }

                var clientID = parseInt(donation.seller_customs[config.customIDKey]);

                if (donation.status === "Completed") {
                    // Pass in the custom variable from API which is the ID of the COD Client
                    this.sendDiscordWebhook(clientID, donation.buyer_id);
                    this.applyNewDonation(clientID);
                    this.markAsProcessed(donation.txn_id, false);
                }

                if (donation.status === "Refunded" || donation.status === "Reversed") {
                    this.removeDonationReward(clientID);
                    this.markAsProcessed(donation.txn_id, false);
                }
            }
        
        } catch (e) {
            this.logger.WriteWarning('There was a problem fetching donations ' + e.message);
        }
    },

    onEventAsync: function (gameEvent, server) {
        // Check if specified time has passed in the config
        // because onTickAsync is not functional yet.
        var now = new Date();
        if (now > nextTime) {
            this.checkForDonations();
            this.checkForEndedSubcriptions();
            this.getNextTime();
        }

        // Check if a new user joined
        if (gameEvent.Type === 4) {
            this.onJoin(gameEvent, server);
        }
    },

    onLoadAsync: function (manager) {
        this.serviceResolver = _serviceResolver;
        this.metaService = this.serviceResolver.ResolveService("IMetaService");
        this.manager = manager;
        this.logger = manager.GetLogger(0);
        this.logger.WriteVerbose("Started Donate Bot plugin V" + this.version.toFixed(1));
        this.getNextTime();
    },

    onUnloadAsync: function () {
    },

    onTickAsync: function (server) {
    }
};
