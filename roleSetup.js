const Role = require('./models/role');
const User = require('./models/user');

async function ensureRoleData() {
  const [adminRole, memberRole] = await Promise.all([
    Role.findOneAndUpdate(
      { key: 'admin' },
      { $setOnInsert: { key: 'admin', name: 'Admin' } },
      { new: true, upsert: true, runValidators: true }
    ),
    Role.findOneAndUpdate(
      { key: 'member' },
      { $setOnInsert: { key: 'member', name: 'Member' } },
      { new: true, upsert: true, runValidators: true }
    )
  ]);

  const unassignedUsers = await User.find({ roleId: { $exists: false } }).select('+normalizedName');
  if (unassignedUsers.length > 0) {
    await User.collection.bulkWrite(unassignedUsers.map(user => {
      const normalizedName = user.normalizedName
        || user.name.trim().normalize('NFKC').toLocaleLowerCase('en-US');
      return {
        updateOne: {
          filter: { _id: user._id, roleId: { $exists: false } },
          update: {
            $set: { roleId: normalizedName === 'sumanth' ? adminRole._id : memberRole._id },
            $unset: { role: '' }
          }
        }
      };
    }));
  }

  await User.collection.updateMany({ roleId: { $exists: true }, role: { $exists: true } }, { $unset: { role: '' } });
}

module.exports = { ensureRoleData };
