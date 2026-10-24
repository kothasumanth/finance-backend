const express = require('express');
const mongoose = require('mongoose');
const Role = require('../models/role');
const User = require('../models/user');
const userOwnedModels = require('../userOwnedModels');
const { isAdmin } = require('../auth');

const router = express.Router();

router.use((req, res, next) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Administrator access is required' });
  }
  return next();
});

function isSumanth(user) {
  return (user.normalizedName || user.name.trim().normalize('NFKC').toLocaleLowerCase('en-US')) === 'sumanth';
}

router.get('/roles', async (req, res, next) => {
  try {
    const roles = await Role.find().sort({ key: 1 }).select('name key');
    return res.json(roles);
  } catch (error) {
    return next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find()
      .select('name isActive roleId +normalizedName')
      .populate('roleId', 'name key')
      .sort({ name: 1 });
    return res.json(users.map(user => ({
      id: user._id,
      name: user.name,
      isActive: user.isActive,
      role: user.roleId ? { id: user.roleId._id, name: user.roleId.name, key: user.roleId.key } : null
    })));
  } catch (error) {
    return next(error);
  }
});

router.put('/users/:id/role', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.body?.roleId)) {
    return res.status(400).json({ error: 'A valid user and role are required' });
  }

  try {
    const [target, role] = await Promise.all([
      User.findById(req.params.id).select('name isActive roleId +normalizedName').populate('roleId'),
      Role.findById(req.body.roleId)
    ]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!target.isActive) return res.status(409).json({ error: 'Deleted users cannot be assigned a role' });
    if (!role || !['admin', 'member'].includes(role.key)) {
      return res.status(400).json({ error: 'Select Admin or Member' });
    }
    if (target._id.equals(req.user._id)) {
      return res.status(409).json({ error: 'You cannot change your own role' });
    }
    if (isSumanth(target) && role.key !== 'admin') {
      return res.status(409).json({ error: 'Sumanth must remain an administrator' });
    }
    if (target.roleId?.key === 'admin' && role.key !== 'admin') {
      const adminCount = await User.countDocuments({ roleId: target.roleId._id, isActive: true });
      if (adminCount <= 1) {
        return res.status(409).json({ error: 'At least one active administrator must remain' });
      }
    }

    target.roleId = role._id;
    await target.save();
    return res.json({
      id: target._id,
      name: target.name,
      role: { id: role._id, name: role.name, key: role.key }
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/users/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'A valid user ID is required' });
  }

  try {
    const target = await User.findById(req.params.id)
      .select('name isActive roleId +normalizedName')
      .populate('roleId');
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target._id.equals(req.user._id)) {
      return res.status(409).json({ error: 'You cannot delete your own account' });
    }
    if (isSumanth(target)) {
      return res.status(409).json({ error: 'The primary Sumanth administrator account cannot be deleted' });
    }
    if (target.roleId?.key === 'admin') {
      const adminCount = await User.countDocuments({ roleId: target.roleId._id, isActive: true });
      if (adminCount <= 1) {
        return res.status(409).json({ error: 'The last active administrator cannot be deleted' });
      }
    }

    target.isActive = false;
    await target.save();
    const deletedCounts = {};
    for (const model of userOwnedModels) {
      const result = await model.deleteMany({ userId: target._id });
      deletedCounts[model.collection.collectionName] = result.deletedCount;
    }

    const result = await User.deleteOne({ _id: target._id, isActive: false });
    if (result.deletedCount !== 1) {
      throw new Error('The user record could not be removed after deleting its financial data');
    }
    return res.json({ success: true, deletedCounts });
  } catch (error) {
    console.error('Account deletion did not complete:', error);
    return res.status(500).json({
      error: 'Account deletion did not complete. The account is disabled; retry deletion to finish removing its data.'
    });
  }
});

module.exports = router;
