const mongoose = require('mongoose');

const userXuBalanceSchema = new mongoose.Schema({
    haravan_customer_id: {
        type: Number,
        required: true,
        unique: true, // Mỗi khách hàng chỉ có một bản ghi số dư xu
        index: true // Đánh index để tìm kiếm nhanh theo customer_id
    },
    xu_amount: {
        type: Number,
        required: true,
        default: 0,
        min: 0 // Số xu không thể âm
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('UserXuBalance', userXuBalanceSchema);