import { DefaultEventsMap, Server } from "socket.io";
import { UserDoc } from "../model/user.model";
import chatroomModel from "../model/chatroom.model";

let onlineUsers: UserDoc[] = [];

const findSocketId = (receiverId: string) => {
    const user = onlineUsers.find(user => user._id === receiverId);
    return user;
};


function extractUserIds(users: UserDoc[]) {
    return users.map(user => user.id);
}

export default async (io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
    io.on('connection', (socket) => {
        console.log(`${socket.id} connected`);

        // Add online user and join room
        socket.on('add-online-user', async ({ user, userChatRooms }) => {
            onlineUsers.push({ socketId: socket.id, ...user });
            console.log('Online users:', onlineUsers.length);
            io.emit('user-logged-in', { user, onlineUsers });
        });

        socket.on('user-active-status-change', ({ userId, status }) => {
            const changedOnlineUsers = onlineUsers.map((onlineUser) => {
                if (`${onlineUser?._id}` === `${userId}`) {
                    return { ...onlineUser, active_status: status }
                }
                else {
                    return onlineUser
                }
            })
            io.emit('new-online-users', changedOnlineUsers)
        })
        socket.on('join-chat-rooms', (chatroomIds: []) => {
            console.log('chatroomId', chatroomIds)
            chatroomIds.map(async (chatroomId: string) => {
                await socket.join('chatroomId');
                console.log(`Socket ${socket.id} joined ${chatroomId}`);
            });
        });

        // Send message to specific chatroom
        socket.on('new-message', ({ sender, receiver, sentTo, message, chatroomId }) => {

            if (Array.isArray(receiver)) {
                receiver.forEach((receiverId) => {
                    const socketId = findSocketId(receiverId.user_id || receiverId)?.socketId;
                    if (socketId) {
                        socket.to(socketId).emit('new-message-added', { sender, sentTo, chatroomId, message });
                    }
                });
            } else {
                const socketId = findSocketId(receiver)?.socketId;
                if (socketId) {
                    socket.to(socketId).emit('new-message-added', { sender, sentTo, chatroomId, message });
                }
            }
        });

        // Notify users in the group when a new user joins
        socket.on('new-group-join', ({ receiver, joined_user, chatroomId }) => {
            if (Array.isArray(receiver)) {
                receiver.forEach((receiverId) => {
                    const socketId = findSocketId(receiverId.user_id || receiverId)?.socketId;
                    if (socketId) {
                        socket.to(socketId).emit('new-user-joined-group', { joined_user });
                    }
                });
            } else {
                const socketId = findSocketId(receiver)?.socketId;
                if (socketId) {
                    socket.to(socketId).emit('new-user-joined-group', { joined_user });
                }
            }
        });

        // Handle typing notification
        socket.on('is-typing', ({ message, currentUser, chatroomId }) => {
            // Notify all users in the chatroom about typing status
            socket.to(chatroomId).emit('is-typing', { message, currentUser });
        });

        // Delete message functionality
        socket.on('delete-message', ({ message, receiver, chatroomId }) => {
            if (Array.isArray(receiver)) {
                receiver.forEach((receiverId) => {
                    const socketId = findSocketId(receiverId.user_id || receiverId)?.socketId;
                    if (socketId) {
                        socket.to(socketId).emit('deleted-message', message);
                    }
                });
            } else {
                const socketId = findSocketId(receiver)?.socketId;
                if (socketId) {
                    socket.to(socketId).emit('deleted-message', message);
                }
            }
        });

        socket.on('react-with-emoji', ({ msg, emoji, _id, receiver }) => {
            if (Array.isArray(receiver)) {
                receiver.forEach((receiverId) => {
                    const socketId = findSocketId(receiverId.user_id || receiverId)?.socketId;
                    if (socketId) {
                        socket.to(socketId).emit('reacted-with-emoji', { msg, emoji });
                    }
                });
            } else {
                const socketId = findSocketId(receiver)?.socketId;
                if (socketId) {
                    socket.to(socketId).emit('reacted-with-emoji', { msg, emoji });
                }
            }
        })


        socket.on('remove-emoji', ({ msg, emoji, _id, receiver }) => {
            if (Array.isArray(receiver)) {
                receiver.forEach((receiverId) => {
                    const socketId = findSocketId(receiverId.user_id || receiverId)?.socketId;
                    if (socketId) {
                        socket.to(socketId).emit('removed-emoji', { msg, emoji });
                    }
                });
            } else {
                const socketId = findSocketId(receiver)?.socketId;
                if (socketId) {
                    socket.to(socketId).emit('removed-emoji', { msg, emoji });
                }
            }
        })

        socket.on('dm', vl => {
            const userIds = extractUserIds(vl.dm.members as UserDoc[]);

            console.log('userIds', userIds)
            if (Array.isArray(vl.dm.members)) {
                userIds.forEach((receiverId) => {
                    const socketId = findSocketId(receiverId)?.socketId;
                    if (socketId) {
                        socket.to(socketId).emit('dm-ed', vl);
                    }
                });
            }
        })

        // User disconnect event
        socket.on('disconnect', () => {
            const user = onlineUsers.find(u => u.socketId === socket.id);
            if (user) {
                onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
                console.log('Online users:', onlineUsers.length);
                io.emit('user-logged-out', { user, onlineUsers });
            }
        });
    });
};
