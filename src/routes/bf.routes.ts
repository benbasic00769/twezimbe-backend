import { Router } from "express";
import { acceptBfJoinRequest, getAllBfs, getCases, fileCase, updateCase, updateWalletBalance, addBeneficiary, addNewBfMember, applyToJoinBF, createBf, declineRequest, getBfJoinRequests, getBfMembers, getGroupBf, getPrincipalBeneficiary, getPrincipalSettings, removeBeneficiary, updateBfUser, updatePrincipalSettings, contributeToBf, deleteBf, updateBf } from "../controller/bf.controller";

const router = Router()

router.put('/wallet/balance', updateWalletBalance)
router.put('/:bfId', updateBf)
router.delete('/:bfId', deleteBf)
router.get('/', getAllBfs)
router.post('/contributions', contributeToBf)
router.get('/cases/:bfId', getCases)
router.post('/cases/:bfId', fileCase)
router.put('/cases/:caseId', updateCase)
router.get('/principal/:principalId', getPrincipalSettings)
router.put('/principal/:principalId', updatePrincipalSettings)
router.post('/beneficiary/remove', removeBeneficiary)
router.post('/beneficiary', addBeneficiary)
router.get('/beneficiary/:principalId/:bfId', getPrincipalBeneficiary)
router.post('/requests/accept', acceptBfJoinRequest)
router.delete('/requests/:requestId', declineRequest)
router.post('/requests', applyToJoinBF)
router.get('/requests/:bf_id', getBfJoinRequests)
router.get('/members/:bf_id', getBfMembers)
router.post('/members', addNewBfMember)
router.post('/', createBf)
router.get('/:groupId', getGroupBf)
router.put('/user', updateBfUser)

export default router