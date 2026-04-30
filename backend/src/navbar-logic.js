
function getNavbarData(path) {
    const isAdmin = localStorage.getItem('noorbyte_loggedIn') === 'true';
    const guestUsername = localStorage.getItem('noorbyte_username');
    
    let username = 'Guest';
    if (isAdmin) {
        username = 'Admin';
    } else if (guestUsername) {
        username = guestUsername;
    }

    const pageNames = {
        '/dashboard': 'Dashboard',
        '/devices': 'Devices',
        '/automation': 'Automation',
        '/checkin': 'Check-in',
        '/groups': 'Groups',
        '/tester': 'API Tester',
        '/jailbreak': 'Jailbreak',
        '/verify': 'Verification'
    };

    // Remove file extension for matching
    const cleanPath = path.replace('.html', '').split('?')[0];
    const pageName = pageNames[cleanPath] || 'System';

    return {
        username,
        pageName
    };
}

module.exports = { getNavbarData };
