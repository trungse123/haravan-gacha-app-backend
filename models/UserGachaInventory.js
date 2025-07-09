const mongoose = require('mongoose');

const userGachaInventorySchema = new mongoose.Schema({
    haravan_customer_id: {
        type: Number,
        required: true,
        index: true
    },
    gacha_item_id: { // ID của vật phẩm Gacha từ bảng GachaItem
        type: mongoose.Schema.Types.ObjectId, // Kiểu ObjectId để tham chiếu đến GachaItem
        ref: 'GachaItem', // Tham chiếu đến Model GachaItem
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    // Có thể thêm trường để theo dõi trạng thái vật phẩm (ví dụ: 'pending_delivery', 'delivered')
    status: {
        type: String,
        enum: ['owned', 'pending_delivery', 'delivered'],
        default: 'owned'
    }
}, {
    timestamps: true
});

// Tạo unique index để đảm bảo mỗi customer chỉ có một bản ghi cho mỗi item
userGachaInventorySchema.index({ haravan_customer_id: 1, gacha_item_id: 1 }, { unique: true });

module.exports = mongoose.model('UserGachaInventory', userGachaInventorySchema);