import { Request, Response } from 'express';
import Bf from '../model/bf.model';
import Group from '../model/group.model';
import { ValidateToken } from '../utils/password.utils';
import asyncWrapper from '../middlewares/AsyncWrapper';
import user_bfModel from '../model/user_bf.model';
import mongoose from 'mongoose';
import { sendEmail } from '../utils/notification.utils';
import User from '../model/user.model'
import bf_requestsModel from './bf_requests.model';


export const createBf = asyncWrapper(async (req: Request, res: Response) => {
    const isTokenValid = await ValidateToken(req);
    if (!isTokenValid) return res.status(403).json({ errors: "Access denied" });

    const { fundName, fundDetails, accountType, accountInfo, walletAddress, groupId } = req.body;

    try {
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({ error: "Group not found" });
        }

        if (group.has_bf) {
            return res.status(400).json({ error: "Group already has a bereavement fund" });
        }

        const newFund = new Bf({
            fundName,
            fundDetails,
            accountType,
            accountInfo,
            walletAddress,
            groupId,
            createdBy: req.user?._id,
        });

        await newFund.save();

        group.has_bf = true;
        await group.save();

        res.status(201).json({
            status: true,
            bf: newFund
        });
    } catch (error) {
        console.error("Error creating fund:", error);
        res.status(500).json({ error: "Error creating fund" });
    }
});


export const getGroupBf = asyncWrapper(async (req: Request, res: Response) => {
    const isTokenValid = await ValidateToken(req);
    if (!isTokenValid) return res.status(403).json({ errors: "Access denied" });

    const { groupId } = req.params;

    try {
        const fund = await Bf.findOne({ groupId }).populate('createdBy', 'firstName lastName');

        if (!fund) {
            return res.status(404).json({ error: "Bereavement fund not found for this group" });
        }

        res.status(200).json({
            status: true,
            bf: fund
        });
    } catch (error) {
        console.error("Error fetching fund:", error);
        res.status(500).json({ error: "Error fetching fund" });
    }
})

export const getBfMembers = asyncWrapper(async (req, res) => {
    const members = await user_bfModel.aggregate([
        {
            $match: {
                bf_id: new mongoose.Types.ObjectId(req.params.bf_id),
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "userId",
                foreignField: "_id",
                as: "member"
            }
        },
        {
            $lookup: {
                from: "bfs",
                localField: "bf_id",
                foreignField: "_id",
                as: "bf"
            }
        },
        {
            $unwind: {
                path: "$member",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $unwind: {
                path: "$bf",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                _id: 1,
                user: "$member",
                bf: "$bf",
                role: 1,
                createdAt: 1
            }
        }
    ]);


    res.status(200).json({
        status: true,
        members
    })
})


export const updateBfUser = asyncWrapper(async (req, res) => {


    const bfUser = await user_bfModel.findOne({ userId: req.body.userId, bf_id: req.body.bf_id })
    if (!bfUser) {
        let newBfUser = await user_bfModel.create({
            userId: req.body.userId,
            bf_id: req.body.bf_id,
            role: "principal"
        })
    }

    const updatedBfUser = await user_bfModel.findOneAndUpdate({ userId: req.body.userId, bf_id: req.body.bf_id }, { ...req.body }, { new: true })
    res.status(200).json({
        status: true,
        bf_user: updatedBfUser
    })
})


export const addNewBfMember = asyncWrapper(async (req, res) => {

    const user = await User.findOne({ _id: req.body.userId })
    if (!user) return res.status(404).json({ status: false, message: "User not found" })
    const bf = await Bf.findById(req.body.bf_id)
    if (!bf) return res.status(404).json({ status: false, message: "Bearevement Fund not found" })
    const bfMemberExists = await user_bfModel.findOne({ bf_id: req.body.bf_id, userId: req.body.userId })
    if (bfMemberExists) return res.status(409).json({ status: false, message: "user is already a member" })
    const newBfMember = await user_bfModel.create({
        bf_id: req.body.bf_id,
        userId: req.body.userId,
        role: req.body.role || 'principal'
    })

    sendEmail(`${user?.email}`, "You were added to a Bearevement Fund", `Hello. Admins of ${bf?.fundName} has added you as as ${req.body.role} for the Fund`)
    res.status(201).json({
        message: "member added successfully",
        bfMember: newBfMember,
        status: true
    })
})

export const applyToJoinBF = asyncWrapper(async (req, res) => {
    const user = await User.findOne({ _id: req.body.userId })
    if (!user) return res.status(404).json({ status: false, message: "User not found" })
    const bf = await Bf.findById(req.body.bf_id)
    if (!bf) return res.status(404).json({ status: false, message: "Bearevement Fund not found" })
    const bfMemberExists = await user_bfModel.findOne({ bf_id: req.body.bf_id, userId: req.body.userId })
    if (bfMemberExists) return res.status(409).json({ status: false, message: "user is already a member" })

    const requestExists = await bf_requestsModel.findOne({ bf_id: req.body.bf_id, user_id: req.body.userId })
    if (requestExists) return res.status(409).json({ status: false, message: "Request was already sent to the admins. Please wait for approval" })
    const newRequest = await bf_requestsModel.create({
        user_id: req.body.userId,
        bf_id: req.body.bf_id
    })

    res.status(201).json({
        status: true,
        message: "Request sent successfully to the admins. Please patiently wait for the approval"
    })
})