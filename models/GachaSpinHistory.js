const mongoose = require('mongoose');

const gachaSpinHistorySchema = new mongoose.Schema({
    haravan_customer_id: {
        type: Number,
        required: true,
        index: true
    },
    gacha_item_id: { // ID của vật phẩm Gacha đã trúng
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GachaItem',
        required: true
    },
    xu_deducted: {
        type: Number,
        required: true,
        min: 0
    },
    gacha_pool_id: { // ID của pool Gacha mà lượt quay này thuộc về
        type: String,
        required: true
    },
    spin_time: {
        type: Date,
        default: Date.now // Tự động lấy thời gian hiện tại
    },
    ip_address: {
        type: String,
        required: false // Tùy chọn, có thể lấy từ request
    },
    status: {
        type: String,
        enum: ['success', 'failed', 'refunded'],
        default: 'success'
    },
    error_message: { // Để ghi lại lỗi nếu có
        type: String,
        required: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('GachaSpinHistory', gachaSpinHistorySchema);