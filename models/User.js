const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    phone: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    address: {
        street: { type: String, default: '' },
        landmark: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        country: { type: String, default: '' },
        pincode: { type: String, default: '' }
    },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    createdAt: { type: Date, default: Date.now },
});

userSchema.statics.createUser = async function({ name, email, password, role = 'user', phone = '', dateOfBirth = '' }) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new this({
        name,
        email,
        password: hashedPassword,
        role,
        phone,
        dateOfBirth
    });
    return user.save();
};

userSchema.statics.findUserByEmail = function(email) {
    return this.findOne({ email });
};

userSchema.methods.validatePassword = function(password) {
    return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);