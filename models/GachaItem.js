const mongoose = require('mongoose');

const GachaItemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    haravan_product_id: { // ID của sản phẩm trên Haravan
        type: String,
        required: true
    },
    // --- THÊM TRƯỜNG MỚI TẠI ĐÂY ---
    haravan_product_handle: { // Handle của sản phẩm trên Haravan (dùng để tạo URL)
        type: String,
        required: false, // Đặt là false để các item cũ không bị lỗi, nhưng item mới nên có
        trim: true
    },
    // ---------------------------------
    haravan_variant_id: { // ID của biến thể trên Haravan
        type: String,
        required: false 
    },
    image_url: {
        type: String,
        required: true
    },
    rank: { // Hạng của vật phẩm (S, A, B, C, D, F)
        type: String,
        enum: ['S', 'A', 'B', 'C', 'D', 'F'],
        required: true
    },
    rank_order: { // <-- THÊM TRƯỜNG NÀY: Giá trị số để sắp xếp Rank
        type: Number,
        required: true,
        default: 99 // Giá trị mặc định nếu không được set, để nó nằm cuối
    },
    base_price: { // Giá trị cơ bản của vật phẩm (để tham khảo)
        type: Number,
        required: true
    },
    weight: { // Trọng số để tính xác suất trúng
        type: Number,
        required: true,
        min: 0
    },
    is_active: { // Vật phẩm có đang hoạt động trong Gacha pool không
        type: Boolean,
        default: true
    },
    gacha_pool_id: { // ID của pool Gacha mà vật phẩm này thuộc về
        type: String,
        required: true,
        trim: true
    }
}, {
    timestamps: true // Tự động thêm createdAt và updatedAt
});

module.exports = mongoose.model('GachaItem', GachaItemSchema);
