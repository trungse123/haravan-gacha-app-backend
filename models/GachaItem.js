const mongoose = require('mongoose');

const gachaItemSchema = new mongoose.Schema({
    haravan_product_id: {
        type: Number,
        required: false, // Not required if some items are not linked to Haravan products
        unique: false // Can be false if multiple gacha items map to the same Haravan product
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    image_url: {
        type: String,
        required: true
    },
    rank: {
        type: String,
        required: true,
        enum: ['S', 'A', 'B', 'C', 'D', 'F'] // Define your ranks
    },
    base_price: { // Giá trị tham khảo của vật phẩm, không phải giá bán
        type: Number,
        required: false,
        default: 0
    },
    weight: { // Trọng số để tính tỷ lệ trúng (ví dụ: S=1, A=5, B=10, C=20, D=30, F=50)
        type: Number,
        required: true,
        min: 1
    },
    is_active: {
        type: Boolean,
        default: true
    },
    // Bạn có thể thêm trường để nhóm các vật phẩm vào các "pool" Gacha khác nhau
    gacha_pool_id: {
        type: String, // Ví dụ: 'miku_special_event_2025'
        required: true
    }
}, {
    timestamps: true // Tự động thêm createdAt và updatedAt
});

module.exports = mongoose.model('GachaItem', gachaItemSchema);