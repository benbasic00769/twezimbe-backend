import { ObjectId } from "mongodb";
import { model, Schema } from "mongoose";


const UserGroupSchema = new Schema({
    user_id: {
        type: ObjectId,
        ref: 'User',
        required: true
    },
    channel_id: {
        type: ObjectId,
        ref: 'Channel',
        required: true
    },
    group_id: {
        type: ObjectId,
        ref: 'groups',
        required: 'true'
    },
    role_id: {
        type: ObjectId,
        ref: 'Role',
        required: true
    },

}, {
    timestamps: true
});

const UserGroup = model("User_Channel", UserGroupSchema);
export default UserGroup;