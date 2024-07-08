const express = require('express');
const bodyParser = require('body-parser');
const { Sequelize, DataTypes } = require('sequelize');
const axios = require('axios');
const { OpenAI } = require('openai');
require('dotenv').config();
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite'
});
const Conversation = sequelize.define('Conversation', {
    userId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    response: {
        type: DataTypes.TEXT,
        allowNull: false
    }
});

sequelize.sync();

app.use(express.static(path.join(__dirname, '..', 'Frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'Frontend', 'index.html'));
});
app.use(cors());
app.use(bodyParser.json());
// app.use(express.static(path.join(__dirname, 'Frontend')));


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

async function fetchRoomsAndFilter(budget) {
    const url = 'https://bot9assignement.deno.dev/rooms';
    try {
        const response = await axios.get(url);
        const data = response.data;
        const filteredRooms = data.filter(room => room.price <= budget);
        return filteredRooms;
    } catch (error) {
        console.error('There was a problem with the fetch operation:', error);
        throw error;
    }
}

async function sendDetails(roomId, fullName, email, nights, price) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Hotel Booking Details at dukaan',
        text: `Exciting news! Your Dukaan Hotel reservation is confirmed:

- Room Number: ${roomId}
- Guest Name: ${fullName}
- Duration: ${nights} night${nights > 1 ? 's' : ''}
- Total Cost: $${price}

We can't wait to welcome you! If you have any questions, just ask. Enjoy your stay!`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully');

        const bookingResponse = await axios.post('https://bot9assignement.deno.dev/book', {
            roomId,
            fullName,
            email,
            nights
        });

        return bookingResponse.data;
    } catch (error) {
        console.error('Error occurred:', error);
        // throw error;
    }
}

const messages = [{
    "role": "system",
    "content": `You are a premium hotel booking service provider for company Dukaan.
    You have to start talking with the user in the language they are using.

Booking flow:
1. You greet the user first.
2. User asks about room booking.
3. You ask for the budget.
4. User provides the budget.
5. You show the rooms available in the budget using function calling. If no room is available in the budget, show the message "No room available in the budget".
6. User selects the room name.
7. You ask for the number of nights.
8. User provides the number of nights.
9. You ask for the number of guests.
10. User provides the number of guests.
11. You ask for the email.
12. User provides the email.
13. You ask for the full name.
14. User provides the full name.
15. You calculate the total price and show it to the user with selected house details.
16. User confirms the booking.
17. You show the booking details with the heading "Booking Details" and send this data to the user's email using function calling.
18. You show the thank you message.`
}];

const tools = [
    {
        type: "function",
        function: {
            name: "fetchRoomsAndFilter",
            description: "Get the available rooms under the budget",
            parameters: {
                type: "object",
                properties: {
                    budget: {
                        type: "number",
                        description: "it requires the price as budget",
                    },
                },
                required: ["budget"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "sendDetails",
            description: "Send the details to user email",
            parameters: {
                type: "object",
                properties: {
                    roomId: {
                        type: "number",
                        description: "it requires the room id ",
                    },
                    fullName: {
                        type: "string",
                        description: "name of the user",
                    },
                    email: {
                        type: "string",
                        description: "email of the user",
                    },
                    nights: {
                        type: "number",
                        description: "number of nights user want to stay",
                    },
                    price: {
                        type: "number",
                        description: "the total price of the room for the nights user want to stay",
                    },
                },
                required: ["roomId", "fullName", "email", "nights", "price"],
            },
        },
    }
];

async function getGPTResponse(userId, message) {
    const userMessage = { "role": "user", "content": message };
    messages.push(userMessage);

    const response = await openai.chat.completions.create({
        messages: messages,
        model: "gpt-4",
        tools: tools,
        tool_choice: "auto",
    });

    const responseMessage = response.choices[0].message;

    const toolCalls = responseMessage.tool_calls;
    if (toolCalls) {
        const availableFunctions = {
            fetchRoomsAndFilter: fetchRoomsAndFilter,
            sendDetails: sendDetails,
        };
        messages.push(responseMessage);
        for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;
            const functionToCall = availableFunctions[functionName];
            const functionArgs = JSON.parse(toolCall.function.arguments);
            const functionResponse = await functionToCall(...Object.values(functionArgs));

            messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: functionName,
                content: JSON.stringify(functionResponse),
            });
        }
        const secondResponse = await openai.chat.completions.create({
            model: "gpt-4",
            messages: messages,
        });
        return secondResponse.choices[0].message.content;
    } else {
        return responseMessage.content;
    }
}

app.post('/chat', async (req, res) => {
    const { userId, message } = req.body;
    if (!userId || !message) {
        return res.status(400).send('Bad Request: Missing userId or message');
    }

    console.log(`Received message: ${message} from user: ${userId}`);

    try {
        const botResponse = await getGPTResponse(userId, message);
        console.log(`Bot response for user ${userId}: ${botResponse}`);

        await Conversation.create({ userId, message, response: botResponse });
        res.json({ response: botResponse });
    } catch (error) {
        console.error('Error during API call:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});