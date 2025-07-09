// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios'); // Import Axios for making HTTP requests

// Import your Mongoose models
const GachaItem = require('./models/GachaItem');
const UserXuBalance = require('./models/UserXuBalance');
const UserGachaInventory = require('./models/UserGachaInventory');
const GachaSpinHistory = require('./models/GachaSpinHistory');

const app = express();
const PORT = process.env.PORT || 3000;

// Get MongoDB URI from environment variables
const MONGODB_URI = process.env.MONGODB_URI;

// --- Database Connection ---
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB Atlas');
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB Atlas:', error);
        process.exit(1); // Exit process if database connection fails
    });
// -------------------------

// Middleware to parse JSON request bodies
app.use(express.json());

// Enable CORS for all origins (for development, narrow this down in production)
app.use(cors());

// --- Haravan API Credentials ---
const HARAVAN_ACCESS_TOKEN = process.env.HARAVAN_ACCESS_TOKEN;
const HARAVAN_SHOP_DOMAIN = process.env.HARAVAN_SHOP_DOMAIN;
const XU_PRODUCT_ID = process.env.XU_PRODUCT_ID; // ID của sản phẩm Xu Gacha trên Haravan

// Base URL for Haravan Admin API
const HARAVAN_ADMIN_API_BASE_URL = `https://${HARAVAN_SHOP_DOMAIN}/admin`;

// Basic route for testing server status
app.get('/', (req, res) => {
    res.send('Haravan Gacha App Backend is running and connected to MongoDB!');
});

// --- API Endpoints ---

// 1. API: GET /api/user/xu-balance
// Mục đích: Lấy số xu hiện có của người dùng
// Tương ứng với 'action: "get_user_xu"' của đối thủ
app.get('/api/user/xu-balance', async (req, res) => {
    const haravan_customer_id = req.query.customer_id;

    if (!haravan_customer_id) {
        return res.status(400).json({ error: 'customer_id is required' });
    }

    try {
        let userBalance = await UserXuBalance.findOne({ haravan_customer_id: haravan_customer_id });

        if (!userBalance) {
            // Nếu người dùng chưa có số dư xu, tạo bản ghi mới với 0 xu
            userBalance = new UserXuBalance({ haravan_customer_id: haravan_customer_id, xu_amount: 0 });
            await userBalance.save();
        }

        res.json({ xu_amount: userBalance.xu_amount });

    } catch (error) {
        console.error('Error fetching user xu balance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. API: GET /api/gacha/items
// Mục đích: Lấy danh sách tất cả các vật phẩm Gacha để hiển thị ở frontend
app.get('/api/gacha/items', async (req, res) => {
    const gachaPoolId = req.query.gacha_pool_id; // Lọc theo pool ID nếu có

    try {
        let query = { is_active: true };
        if (gachaPoolId) {
            query.gacha_pool_id = gachaPoolId;
        }
        const items = await GachaItem.find(query).select('-__v -createdAt -updatedAt'); // Lấy tất cả và bỏ các trường không cần thiết

        res.json(items);

    } catch (error) {
        console.error('Error fetching gacha items:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// 3. API: POST /api/gacha/spin
// Mục đích: Thực hiện một lượt quay Gacha
// Tương ứng với 'action: "save_buyGacha"' và 'action: "save_getSlotIDGacha"' của đối thủ
app.post('/api/gacha/spin', async (req, res) => {
    const { customer_id, gacha_cost, gacha_pool_id } = req.body;

    if (!customer_id || !gacha_cost || !gacha_pool_id) {
        return res.status(400).json({ error: 'customer_id, gacha_cost, and gacha_pool_id are required' });
    }

    try {
        // 1. Kiểm tra và trừ xu của người dùng
        let userBalance = await UserXuBalance.findOne({ haravan_customer_id: customer_id });

        if (!userBalance || userBalance.xu_amount < gacha_cost) {
            return res.status(402).json({ status: 'insufficient_xu', message: 'Bạn không đủ xu để thực hiện gacha!' });
        }

        // --- Bắt đầu Transaction (Quan trọng cho tính toàn vẹn dữ liệu) ---
        // Trong Mongoose v5.x, transaction trên shared cluster (M0) có thể bị hạn chế.
        // Với Mongoose v6+, bạn cần dùng `await mongoose.startSession()`
        // Để đơn giản, hiện tại chúng ta sẽ thực hiện tuần tự và xử lý rollback thủ công nếu có lỗi.
        // Đối với production, hãy tìm hiểu về MongoDB Transactions.

        userBalance.xu_amount -= gacha_cost;
        await userBalance.save(); // Cập nhật số dư xu

        // 2. Lấy danh sách các vật phẩm trong pool Gacha
        const gachaItems = await GachaItem.find({ gacha_pool_id: gacha_pool_id, is_active: true });
        if (gachaItems.length === 0) {
            // Hoàn lại xu nếu không có vật phẩm
            userBalance.xu_amount += gacha_cost;
            await userBalance.save();
            await GachaSpinHistory.create({
                haravan_customer_id: customer_id,
                gacha_item_id: null, // Không có vật phẩm
                xu_deducted: gacha_cost,
                gacha_pool_id: gacha_pool_id,
                ip_address: req.ip,
                status: 'failed',
                error_message: 'No active gacha items found for this pool.'
            });
            return res.status(404).json({ error: 'No active gacha items found for this pool.', status: 'refunded_xu' });
        }

        // 3. Thực hiện thuật toán quay ngẫu nhiên (dựa trên trọng số - weight)
        let totalWeight = gachaItems.reduce((sum, item) => sum + item.weight, 0); // Tính tổng trọng số
        if (totalWeight === 0) {
             // Hoàn lại xu nếu tổng trọng số là 0
            userBalance.xu_amount += gacha_cost;
            await userBalance.save();
            await GachaSpinHistory.create({
                haravan_customer_id: customer_id,
                gacha_item_id: null,
                xu_deducted: gacha_cost,
                gacha_pool_id: gacha_pool_id,
                ip_address: req.ip,
                status: 'failed',
                error_message: 'Total weight of gacha items is zero.'
            });
            return res.status(500).json({ error: 'Gacha pool configured incorrectly.', status: 'refunded_xu' });
        }

        let randomNumber = Math.random() * totalWeight; // Số ngẫu nhiên từ 0 đến tổng trọng số
        let wonItem = null;
        let cumulativeWeight = 0;

        for (const item of gachaItems) {
            cumulativeWeight += item.weight;
            if (randomNumber <= cumulativeWeight) {
                wonItem = item;
                break;
            }
        }

        if (!wonItem) {
            // Trường hợp hiếm khi không tìm thấy vật phẩm (do lỗi làm tròn hoặc logic)
            // Hoàn lại xu nếu không tìm thấy vật phẩm
            userBalance.xu_amount += gacha_cost;
            await userBalance.save();
            await GachaSpinHistory.create({
                haravan_customer_id: customer_id,
                gacha_item_id: null,
                xu_deducted: gacha_cost,
                gacha_pool_id: gacha_pool_id,
                ip_address: req.ip,
                status: 'failed',
                error_message: 'Failed to determine gacha prize despite available pool.'
            });
            console.error('Error: No item won despite available pool, refunded xu.');
            return res.status(500).json({ error: 'Failed to determine gacha prize.', status: 'refunded_xu' });
        }

        // 4. Cập nhật kho vật phẩm đã trúng của người dùng trong App DB
        await UserGachaInventory.findOneAndUpdate(
            { haravan_customer_id: customer_id, gacha_item_id: wonItem._id },
            { $inc: { quantity: 1 }, status: 'owned' }, // Tăng số lượng lên 1 và đặt trạng thái
            { upsert: true, new: true, setDefaultsOnInsert: true } // Tạo mới nếu chưa có, trả về bản ghi mới
        );

        // 5. Ghi lịch sử lượt quay
        const spinHistory = new GachaSpinHistory({
            haravan_customer_id: customer_id,
            gacha_item_id: wonItem._id,
            xu_deducted: gacha_cost,
            gacha_pool_id: gacha_pool_id,
            ip_address: req.ip // Lấy IP từ request
        });
        await spinHistory.save();


        // 6. TẠO ĐƠN HÀNG TRÊN HARAVAN CHO VẬT PHẨM TRÚNG (TỰ ĐỘNG TRỪ KHO)
        if (wonItem.haravan_product_id) { // Chỉ tạo đơn hàng nếu vật phẩm Gacha có liên kết với sản phẩm Haravan
            // Để tạo đơn hàng trên Haravan, chúng ta cần thông tin địa chỉ giao hàng của khách hàng.
            // Phương án tốt nhất là lấy địa chỉ mặc định từ Haravan Customer API hoặc yêu cầu khách hàng cung cấp khi trúng thưởng.
            // Hiện tại, chúng ta sẽ tạo một đơn hàng với thông tin tối thiểu.
            // Haravan sẽ tự động điền các thông tin khác từ hồ sơ khách hàng nếu có.
            const orderData = {
                order: {
                    line_items: [{
                        product_id: wonItem.haravan_product_id,
                        quantity: 1,
                        price: 0, // Giá 0đ vì đã thanh toán bằng xu
                    }],
                    customer: {
                        id: customer_id // Chỉ dùng ID, Haravan sẽ tự lấy thông tin đã có
                    },
                    financial_status: 'paid', // Coi như đã thanh toán bằng xu
                    // fulfillment_status: 'unfulfilled', // Ban đầu chưa giao
                    note: `Vật phẩm trúng Gacha: ${wonItem.name} (Pool: ${gacha_pool_id})`,
                    tags: 'Gacha_Reward' // Gắn tag để dễ quản lý
                }
            };

            try {
                // Gọi Haravan Admin API để tạo đơn hàng
                const haravanOrderRes = await axios.post(`${HARAVAN_ADMIN_API_BASE_URL}/orders.json`, orderData, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${HARAVAN_ACCESS_TOKEN}`
                    }
                });
                console.log(`Order created on Haravan for ${wonItem.name}: Order ID ${haravanOrderRes.data.order.id}`);
            } catch (haravanError) {
                console.error('Error creating order on Haravan:', haravanError.response ? haravanError.response.data : haravanError.message);
                // Xử lý lỗi tạo đơn hàng:
                // Trong production, bạn cần có cơ chế thông báo admin để xử lý thủ công,
                // hoặc thử lại, hoặc hoàn xu cho người dùng nếu đơn hàng không thể tạo được.
                // Để đơn giản hiện tại, chúng ta chỉ log lỗi và vẫn trả về kết quả quay thành công cho user.
            }
        }


        // 7. Trả về thông tin vật phẩm trúng cho frontend
        res.json({
            status: 'success',
            won_item_id: wonItem._id, // Trả về ID của vật phẩm trúng trong DB của bạn
            won_item_details: { // Các chi tiết cần thiết cho animation và popup
                name: wonItem.name,
                image_url: wonItem.image_url,
                rank: wonItem.rank,
                price: wonItem.base_price, // Giá trị tham khảo
            },
            current_xu: userBalance.xu_amount // Số xu còn lại sau khi quay
        });

    } catch (error) {
        console.error('Critical error during gacha spin:', error);
        res.status(500).json({ error: 'Internal server error', status: 'critical_error' });
    }
});

// 4. API: POST /haravan/webhook/order-paid
// Mục đích: Nhận và xử lý webhook từ Haravan khi đơn hàng được thanh toán (để cộng xu)
app.post('/haravan/webhook/order-paid', async (req, res) => {
    const orderData = req.body; // Dữ liệu đơn hàng từ Haravan

    // Log webhook data (chỉ cho mục đích debug, KHÔNG NÊN log thông tin nhạy cảm trong production)
    console.log('Received Haravan Webhook (Order Paid):', JSON.stringify(orderData, null, 2));

    try {
        if (!orderData || !orderData.id || !orderData.line_items || !orderData.customer || !orderData.customer.id) {
            console.error('Invalid webhook data received or missing customer ID.');
            return res.status(400).send('Invalid webhook data');
        }

        // Chỉ xử lý webhook cho đơn hàng đã thanh toán (đảm bảo financial_status là "paid")
        if (orderData.financial_status !== 'paid') {
            console.log(`Order ${orderData.id} is not paid. Skipping Xu award.`);
            return res.status(200).send('Order not paid');
        }

        const haravan_customer_id = orderData.customer.id;
        let xuAmountToAward = 0;
        let isXuOrder = false;

        // Duyệt qua các line_item trong đơn hàng để tìm sản phẩm "Xu Gacha"
        for (const item of orderData.line_items) {
            // Xác định sản phẩm Xu Gacha bằng product_id
            if (item.product_id && item.product_id.toString() === XU_PRODUCT_ID.toString()) {
                isXuOrder = true;
                // Nếu sản phẩm Xu có nhiều biến thể ứng với số lượng Xu khác nhau,
                // bạn cần một logic để xác định số xu từ variant_id hoặc metadata.
                // VD: "Gói 3500 Xu" với product_id=X và price=350000 VND
                // Ta có thể giả định 1 đơn vị sản phẩm xu tương ứng với giá trị xu đã định.
                // Hoặc lưu trữ số xu tương ứng trong tên/SKU/metadata của variant.
                // Ở đây ta đơn giản giả định XU_PRODUCT_ID là một sản phẩm đơn lẻ có 1 biến thể với số xu đã biết.
                // Hoặc bạn có thể tính từ price của line item: ví dụ 100đ = 1 xu => 1 xu = 100
                // For simplicity, let's assume one unit of XU_PRODUCT_ID corresponds to 3500 xu as in your example.
                // Or if item.price on Haravan is 350000, and 1 xu = 100 dong, then 350000/100 = 3500 xu
                const XU_RATE = 100; // Ví dụ: 1 Xu = 100 VND. Thay đổi theo tỷ lệ của bạn
                xuAmountToAward += (item.price * item.quantity) / XU_RATE; // Tính tổng số xu dựa trên giá và số lượng

                // HOẶC nếu bạn có các biến thể với số xu cố định (ví dụ: SKU='XU3500' => 3500 xu)
                // if (item.sku === 'XU3500') xuAmountToAward += 3500 * item.quantity;
                // else if (item.sku === 'XU1000') xuAmountToAward += 1000 * item.quantity;
                // ...
            }
        }

        if (isXuOrder && xuAmountToAward > 0) {
            // Cập nhật số dư xu cho người dùng
            let userBalance = await UserXuBalance.findOneAndUpdate(
                { haravan_customer_id: haravan_customer_id },
                { $inc: { xu_amount: xuAmountToAward } }, // Tăng số lượng xu
                { upsert: true, new: true, setDefaultsOnInsert: true } // Tạo mới nếu chưa có, trả về bản ghi mới
            );
            console.log(`Webhook: Awarded ${xuAmountToAward} xu to customer ${haravan_customer_id}. New balance: ${userBalance.xu_amount}`);
        } else {
            console.log(`Webhook: Order ${orderData.id} is not an Xu Gacha order or Xu amount is 0. Skipping.`);
        }

        // Luôn trả về 200 OK cho Haravan để xác nhận đã nhận webhook thành công
        res.status(200).send('Webhook received and processed');

    } catch (error) {
        console.error('Critical error processing Haravan webhook:', error);
        res.status(500).send('Internal server error'); // Trả về lỗi 500 nếu có lỗi server nội bộ
    }
});


// 5. API: GET /api/gacha/history
// Mục đích: Lấy lịch sử các lượt quay Gacha gần đây
// Tương ứng với 'action: 'load_gacha_history'' của đối thủ
app.get('/api/gacha/history', async (req, res) => {
    const { customer_id, limit = 10, offset = 0 } = req.query;

    let query = {};
    if (customer_id) {
        query.haravan_customer_id = customer_id;
    }

    try {
        const history = await GachaSpinHistory.find(query)
                                            .sort({ spin_time: -1 })
                                            .limit(parseInt(limit))
                                            .skip(parseInt(offset))
                                            .populate('gacha_item_id', 'name image_url');

        const formattedHistory = history.map(entry => ({
            user_id: entry.haravan_customer_id,
            item_name: entry.gacha_item_id ? entry.gacha_item_id.name : 'Unknown Item',
            item_image: entry.gacha_item_id ? entry.gacha_item_id.image_url : 'default_image.png',
            spin_time: entry.spin_time,
            // Bạn có thể thêm logic để hiển thị thời gian "X giờ trước" ở frontend
        }));

        res.json(formattedHistory);

    } catch (error) {
        console.error('Error fetching gacha history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Start the server ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access it at: http://localhost:${PORT}`);
});