import { NextFunction, Request, Response } from "express";
import asyncWrapper from "../middlewares/AsyncWrapper";
import { ValidateToken } from "../utils/password.utils";
import Group from '../model/group.model'
import Role from '../model/role.model'
import UserGroup from '../model/user_group.model'
import RoleUser from "../model/user_role";
import mongoose from "mongoose";
import User, { UserDoc } from "../model/user.model";
import { sendEmail } from "../utils/notification.utils";
import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'

export const addGroup = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const isTokenValid = await ValidateToken(req);

    if (!isTokenValid) return res.status(403).json({ errors: "Access denied" })
    const existingGroup = await Group.findOne({ name: req.body.name });
    if (existingGroup) return res.status(403).json({ errors: `Group with ${existingGroup.name}. Please try a different name` })
    let newGroup = await Group.create(req.body)


    if (newGroup) {
        newGroup.invite_link = `${process.env.FRONTEND_URL}/groups/invitation/${newGroup._id}`
        await newGroup.save()
        const ManagerRole = await Role.findOne({ role_name: "GroupManager" })
        const UserRole = await Role.findOne({ role_name: "GroupUser" })

        const newManager = await UserGroup.create({
            user_id: req?.body?.created_by,
            group_id: newGroup?._id,
            role_id: ManagerRole?.id
        })

        if (newManager) {
            req?.body?.selectedUsers_Id?.forEach(async (user_id: string) => {
                await UserGroup.create({
                    user_id: user_id,
                    group_id: newGroup?._id,
                    role_id: UserRole?.id
                })

            })
        }

        await RoleUser.create({
            user_id: req?.body?.created_by,
            role_id: ManagerRole?.id
        })

        req?.body?.selectedUsers_Id?.forEach(async (user_id: string) => {
            await RoleUser.create({
                user_id: user_id,
                role_id: UserRole?.id
            })
        })

        newGroup = await newGroup.populate('created_by')

        const createdBy = newGroup.created_by as UserDoc

        sendEmail(`${createdBy.email}`, "Twezimbe Groups - Invitation Link", `Use this link to invite members of your group ${newGroup.name} --> ${newGroup.invite_link}`)

        res.status(200).json({ group: newGroup, message: "Group Created successfully", invitationLink: newGroup.invite_link })
    }

})



export const getPublicGroups = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const isTokenValid = await ValidateToken(req);
    if (!isTokenValid) {
        return res.status(400).json({ message: "Access denied" });
    }

    const existingUser = await User.findOne({ email: req.user?.email });

    if (!existingUser) {
        return res.status(400).json({ message: "User not found" });
    }

    const userId = existingUser?.id;

    if (userId) {
        try {
            if (typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
                throw new Error('Invalid userId: must be a valid ObjectId string');
            }

            const joinedGroups = await UserGroup.find({ user_id: userId }).distinct('group_id');

            const result = await Group.aggregate([
                {
                    $match: {
                        _id: { $nin: joinedGroups },
                        group_state: "Public",
                        del_flag: 0
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'created_by',
                        foreignField: '_id',
                        as: 'createdByDetails'
                    }
                },
                {
                    $unwind: '$createdByDetails'
                },
                {
                    $lookup: {
                        from: 'user_groups',
                        localField: '_id',
                        foreignField: 'group_id',
                        as: 'members'
                    }
                },
                {
                    $addFields: {
                        uniqueMembers: { $setUnion: '$members.user_id' }
                    }
                },
                {
                    $addFields: {
                        memberCount: { $size: '$uniqueMembers' }
                    }
                },
                {
                    $project: {
                        group_id: '$_id',
                        group_name: '$name',
                        group_type: '$group_type',
                        group_state: '$group_state',
                        group_picture: '$group_picture',
                        invite_link: '$invite_link', // Access directly
                        description: '$description',
                        upgraded: '$upgraded', // Access directly
                        isSacco: '$isSacco', // Access directly
                        tags: '$tags',
                        created_by: '$createdByDetails.name',
                        del_flag: '$del_flag',
                        createdAt: '$createdAt',
                        updatedAt: '$updatedAt',
                        memberCount: 1
                    }
                }
            ]);

            res.status(200).json({ message: "Successfully fetched unjoined groups", groups: result });
        } catch (err) {
            next(err);
        }
    } else {
        return res.status(400).json({ message: "Failed to fetch unjoined groups" });
    }
})


export const getJoinedGroupList = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const isTokenValid = await ValidateToken(req);
    if (!isTokenValid) {
        return res.status(400).json({ message: "Access denied" });
    }

    const existingUser = await User.findOne({ email: req.user?.email });
    if (!existingUser) {
        return res.status(400).json({ message: "User not found" });
    }

    const userId = existingUser?.id;

    if (userId) {
        try {
            if (typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
                throw new Error('Invalid userId: must be a valid ObjectId string');
            }

            const result = await UserGroup.aggregate([
                {
                    $match: { user_id: new mongoose.Types.ObjectId(userId) }
                },
                {
                    $lookup: {
                        from: 'roles', // collection name in MongoDB
                        localField: 'role_id',
                        foreignField: '_id',
                        as: 'roleDetails'
                    }
                },
                {
                    $unwind: '$roleDetails'
                },
                {
                    $lookup: {
                        from: 'groups', // Collection name in MongoDB
                        localField: 'group_id',
                        foreignField: '_id',
                        as: 'groupDetails'
                    }
                },
                {
                    $unwind: '$groupDetails'
                },
                {
                    $group: {
                        _id: '$groupDetails._id', // Group by group ID
                        group_id: { $first: '$groupDetails._id' },
                        role_name: { $first: '$roleDetails.role_name' },
                        group_name: { $first: '$groupDetails.name' },
                        group_type: { $first: '$groupDetails.group_type' },
                        group_state: { $first: '$groupDetails.group_state' },
                        group_picture: { $first: '$groupDetails.group_picture' },
                        description: { $first: '$groupDetails.description' },
                        invite_link: { $first: "$invite_link" },
                        tags: { $first: '$groupDetails.tags' },
                        upgraded: { $first: "$upgraded" },
                        isSacco: { $first: "$isSacco" },
                        created_by: { $first: '$groupDetails.created_by' },
                        del_flag: { $first: '$groupDetails.del_flag' },
                        createdAt: { $first: '$groupDetails.createdAt' },
                        updatedAt: { $first: '$groupDetails.updatedAt' }
                    }
                }
            ]);

            res.status(201).json({ message: "successfully", groups: result });

        } catch (err) {
            throw err;
        }
    } else {
        return res.status(400).json({ message: "Failed" });
    }
});



export const getGroupById = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const isTokenValid = await ValidateToken(req);
    if (!isTokenValid) {
        return res.status(400).json({ message: "Access denied" });
    }

    const existingUser = await User.findOne({ email: req.user?.email });
    if (!existingUser) {
        return res.status(400).json({ message: "User not found" });
    }

    const userId = existingUser?.id;

    // Aggregation to get the group and its unique members
    const groupDetails = await Group.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.params.groupId),
                del_flag: 0, // Ensuring the group is not deleted
            }
        },
        {
            $lookup: {
                from: 'user_groups', // Assuming this is the correct collection name for user groups
                localField: '_id',
                foreignField: 'group_id',
                as: 'members'
            }
        }, {
            $lookup: {
                from: 'users', // Assuming this is the correct collection name for user groups
                localField: 'created_by',
                foreignField: '_id',
                as: 'created_by'
            }
        },
        {
            $lookup: {
                from: 'users', // Collection containing user details
                localField: 'members.user_id', // Assuming user_id field in user_groups
                foreignField: '_id',
                as: 'memberDetails'
            }
        },
        {
            $unwind: {
                path: '$memberDetails',
                preserveNullAndEmptyArrays: true // Keep the group even if there are no members
            }
        },
        {
            $group: {
                _id: '$_id',
                group_id: { $first: '$_id' },
                group_name: { $first: '$name' },
                group_type: { $first: '$group_type' },
                group_state: { $first: '$group_state' },
                group_picture: { $first: '$group_picture' },
                description: { $first: '$description' },
                tags: { $first: '$tags' },
                invite_link: { $first: "$invite_link" },
                upgraded: { $first: "$upgraded" },
                isSacco: { $first: "$isSacco" },
                created_by: { $first: '$created_by' },
                del_flag: { $first: '$del_flag' },
                createdAt: { $first: '$createdAt' },
                updatedAt: { $first: '$updatedAt' },
                members: { $addToSet: '$memberDetails' }
            }
        }
    ]);

    if (!groupDetails.length) {
        return res.status(404).json({ errors: "Group not found" });
    }

    res.status(200).json({
        Success: true,
        message: "Group found",
        group: groupDetails[0] // Returning the first (and only) group
    });
});




export const joinGroup = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const isTokenValid = await ValidateToken(req);

    if (!isTokenValid) {
        return res.status(400).json({ message: "Access denied" });
    }


    const existingGroup = await UserGroup.findOne({ user_id: req.body.user_id, group_id: req.body.group_id });

    if (existingGroup) {
        return res.status(400).json({ message: "You have already joined!" });
    } else {
        const role = await Role.findOne({ role_name: "GroupUser" });
        const group = await Group.findById(req.body.group_id).populate('created_by');
        const createdByUser = group?.created_by as UserDoc;

        if (!group?.upgraded && group?.memberCount! >= 100) {
            sendEmail(createdByUser.email, `Upgrade ${group?.name}`, `Upgrade your Twezimbe Groups plan to have unlimited members in your group`);
            return res.status(403).json({
                status: false,
                errors: "Unable to Join Group. Member limit reached. Please contact the group admins"
            })
        }
        const newJoinGroup = await UserGroup.create({
            user_id: req.body.user_id,
            group_id: req.body.group_id,
            role_id: role?._id
        });

        if (newJoinGroup) {
            const existingRole = await RoleUser.findOne({ user_id: req.body.user_id, role_id: role?._id });

            if (!existingRole) {
                await RoleUser.create({
                    user_id: req.body.user_id,
                    role_id: role?._id
                });
            }



            if (createdByUser && createdByUser.email) {
                sendEmail(createdByUser.email, "Twezimbe Groups - New Member", `${group?.name} has a new member!`);
            } else {
                console.error('Could not find email for group owner');
            }
            await Group.findByIdAndUpdate(group?._id, { $inc: { memberCount: 1 } });
            res.status(201).json({ message: "New role added successfully", group: newJoinGroup });
        }
    }
});


export const updateGroupPicture = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const isTokenValid = await ValidateToken(req);
    if (!isTokenValid) {
        return res.status(400).json({ message: "Access denied" });
    };

    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const userId = req?.user?._id;
    const groupId = req.body.groupId

    const existingUser = await User.findOne({ _id: userId });
    if (!existingUser) {
        return res.status(400).json({ message: "User not found" });
    }

    const existingGroup = await UserGroup.findOne({ user_id: userId, group_id: groupId });
    if (!existingGroup) return res.status(404).json({ errors: "Group not found" })


    const uploadResult = await cloudinary.uploader.upload(req.file.path);
    const updatedGroup = await Group.findByIdAndUpdate(groupId, {
        group_picture: uploadResult.secure_url
    });

    if (!updatedGroup) {
        return res.status(404).json({ message: 'Group not found' });
    }

    fs.unlink(req.file.path, (err) => {
        if (err) {
            console.error('Error deleting file:', err);
        }
    });

    res.status(200).json({
        message: 'Group Profile picture uploaded successfully',
        profilePicUrl: uploadResult.secure_url,
        group: updatedGroup,
        status: true
    });
})


export const updateGroup = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
    const isTokenValid = await ValidateToken(req);
    if (!isTokenValid) {
        return res.status(400).json({ message: "Access denied" });
    };

    const existingGroup = await UserGroup.findOne({ user_id: req?.user?._id, group_id: req.body.group_id });
    if (!existingGroup) return res.status(404).json({ errors: "Group not found" })
    const group = await Group.findOne({ _id: req.body.group_id })

    console.log(req.body)
    if (req.body.isSacco && group?.memberCount! < 5){
        return res.status(403).json({errors:"Can't Transition to SACCO. You need at least 5 members of the group."})
    }

        const updatedGroup = await Group.findByIdAndUpdate(req.body.group_id, {
            $set: {
                ...req.body
            }
        })

    if (!updatedGroup) return res.status(500).json({ errors: "Something went wrong. Please try again" })

    res.status(200).json({
        status: true,
        message: "group successfully updated"
    })

})

// export const RequestToJoinGroup = asyncWrapper(async (req: Request, res: Response, next: NextFunction) => {
//     const isTokenValid = await ValidateToken(req);
//     if (!isTokenValid) {
//         return res.status(400).json({ message: "Access denied" });
//     };

//     const existingUser = await User.findOne({ _id: req?.user?._id });
//     if (!existingUser) {
//         return res.status(400).json({ message: "User not found" });
//     }

//     const existingGroup = await Group.findOne({ group_id: req.body.group_id }).populate('created_by');
//     if (!existingGroup) return res.status(404).json({ errors: "Group not found" })

//     const createdBy = await existingGroup.populate('created_by') as UserDoc;
//     const newRequest = await GroupRequest.create(req.body)
//     if (!newRequest) return res.status(500).json({ errors: "Something went wrong" })

//     sendEmail(`${createdBy.email}`, `${existingGroup?.name} - New Join Request`, `${existingUser?.email} has requested to join your group. Visit the platform to confirm`)

//     res.status(201).json({
//         status: true,
//         message: "New request sent successfully"
//     })

// })