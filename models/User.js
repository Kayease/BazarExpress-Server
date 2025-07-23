const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: false, default: "" },
    email: { type: String, required: false, unique: true, sparse: true },
    password: { type: String, required: false, default: "" },
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

userSchema.statics.createUser = async function({ name = '', email = '', password = '', role = 'user', phone = '', dateOfBirth = '' }) {
    let hashedPassword = '';
    if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
    }
    const userData = {
        name,
        role,
        phone,
        dateOfBirth
    };
    if (email) userData.email = email;
    if (password) userData.password = hashedPassword;
    const user = new this(userData);
    return user.save();
};

userSchema.statics.findUserByEmail = function(email) {
    return this.findOne({ email });
};

userSchema.methods.validatePassword = function(password) {
    return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);