const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

let userId = 'user' + Math.floor(Math.random() * 1000);
console.log(`Generated userId: ${userId}`);

function addMessage(message, isUser) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(isUser ? 'user-message' : 'bot-message');
    messageElement.textContent = message;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    console.log(`Added message: "${message}" (isUser: ${isUser})`);
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        console.log(`Sending message: "${message}"`);
        addMessage(message, true);
        messageInput.value = "";

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId, message }),
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`Received response: ${JSON.stringify(data)}`);
                addMessage(data.response, false);
            } else {
                console.error('Server responded with an error');
                addMessage('Error: Could not get a response from the server.', false);
            }
        } catch (error) {
            console.error('Error:', error);
            addMessage('Error: Could not connect to the server.', false);
        }
    } else {
        console.log('Empty message, not sending');
    }
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

// Initial greeting
console.log('Adding initial greeting message');
addMessage('Welcome to the Hotel Booking Chatbot! How can I assist you today?', false);
