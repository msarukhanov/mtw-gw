const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const adminRoutes = require('./routes/adminRoutes');
const sportRoutes = require('./routes/sportRoutes');
const playerRoutes = require('./routes/playerRoutes');
const seamlessRoutes = require('./routes/seamlessRoutes');
const websiteRoutes = require('./routes/websiteRoutes');

const vGB = require('./gachaBuilder/routes');

function init(app) {
    app.use('/api/seamless/', seamlessRoutes);
    app.use('/api/player/', playerRoutes);
    app.use('/api/admin/', adminRoutes);

    app.use('/api/vgb/', vGB);

    app.use('/api', authRoutes);
    app.use('/api', gameRoutes);
    app.use('/api', sportRoutes);
    app.use('/api', websiteRoutes);
}

module.exports = init;