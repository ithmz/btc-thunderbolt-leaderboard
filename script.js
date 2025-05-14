const searchInput = document.querySelector('.search-box');
const searchButton = document.querySelector('.search-button');
const resultsContent = document.querySelector('.search-results-content');

let dailyTransactionStats = null;
let weeklyTransactionStats = null;
let isFetchingApiData = false;
let isFetchingActiveUserCount = false;

function formatDateForAPI(dateObj) {
    const year = dateObj.getUTCFullYear();
    const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getUTCDate()).padStart(2, '0');
    const hours = String(dateObj.getUTCHours()).padStart(2, '0');
    const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
    const seconds = String(dateObj.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function fetchActiveUserStatsCount() {
    if (isFetchingActiveUserCount) {
        console.log("Already fetching active user count.");
        return null;
    }
    isFetchingActiveUserCount = true;
    const nowUTC = new Date();
    const sevenDaysAgoUTC = new Date(nowUTC.getTime() - (7 * 24 * 60 * 60 * 1000));
    const fromDateForUserStats = formatDateForAPI(sevenDaysAgoUTC);
    const activeUserStatsUrl = `https://stats.thunderbolt.lt/api/v1/statistic/users/active/stats?interval=1d&epoch=7&from=${encodeURIComponent(fromDateForUserStats)}`;
    console.log(`Fetching active user stats from: ${activeUserStatsUrl}`);
    try {
        const response = await fetch(activeUserStatsUrl);
        if (!response.ok) throw new Error(`HTTP error! Active User Stats status: ${response.status} - ${response.statusText}`);
        const jsonData = await response.json();
        if (jsonData && jsonData.success === true && jsonData.data && Array.isArray(jsonData.data.counts)) {
            const totalCount = jsonData.data.counts.reduce((sum, current) => sum + current, 0);
            console.log(`Total active user count for transaction data: ${totalCount}`);
            return totalCount;
        } else {
            let errorMessage = "Active User Stats API request was not successful or data format is incorrect";
            if (jsonData && jsonData.message) errorMessage += `: ${jsonData.message}`;
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error('Error fetching active user stats count:', error);
        throw error;
    } finally {
        isFetchingActiveUserCount = false;
    }
}

async function fetchTransactionSpeedData(fromDateTimeUTC, toDateTimeUTC, count, periodType) {
    if (count === null || count < 0) {
        console.error(`Invalid count for ${periodType} fetchTransactionSpeedData:`, count);
        throw new Error(`Invalid count from active user stats. Cannot fetch ${periodType} transaction data.`);
    }
    const baseUrl = 'https://stats.thunderbolt.lt/api/v1/statistic/transactions/speed';
    const params = new URLSearchParams({ from: fromDateTimeUTC, to: toDateTimeUTC, count: count });
    const fullUrl = `${baseUrl}?${params.toString()}`;
    console.log(`Fetching ${periodType} transaction speed data from: ${fullUrl}`);
    try {
        const response = await fetch(fullUrl);
        if (!response.ok) throw new Error(`HTTP error! ${periodType} Transaction Speed Data status: ${response.status} - ${response.statusText}`);
        const jsonData = await response.json();
        if (jsonData && jsonData.success === true && Array.isArray(jsonData.data)) {
            console.log(`${periodType} transaction speed data fetched successfully! (${jsonData.data.length} addresses for count ${count})`);
            return jsonData.data;
        } else {
            let errorMessage = `${periodType} Transaction Speed Data API request was not successful`;
            if (jsonData && jsonData.message) errorMessage += `: ${jsonData.message}`;
            else if (jsonData && !Array.isArray(jsonData.data)) errorMessage = `API response 'data' field for ${periodType} is not an array.`;
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error(`Error fetching ${periodType} transaction speed data:`, error);
        throw error;
    }
}

async function triggerFullDataFetchOnSearch() {
    if (isFetchingApiData) {
        showStatusMessage("Data fetch already in progress...", resultsContent);
        return false;
    }
    isFetchingApiData = true;
    dailyTransactionStats = null;
    weeklyTransactionStats = null;

    try {
        showStatusMessage("Fetching data for address lookup (this may take a moment)...", resultsContent);
        const dynamicCount = await fetchActiveUserStatsCount();
        if (dynamicCount === null) {
            showStatusMessage("Failed to get active user count. Cannot perform lookup.", resultsContent);
            return false;
        }

        const nowUTC = new Date();
        showStatusMessage("Fetching daily transaction data...", resultsContent);
        const dailyToDateTimeUTC = formatDateForAPI(nowUTC);
        const dailyFromDateObj = new Date(nowUTC.getTime() - (24 * 60 * 60 * 1000));
        const dailyFromDateTimeUTC = formatDateForAPI(dailyFromDateObj);
        dailyTransactionStats = await fetchTransactionSpeedData(dailyFromDateTimeUTC, dailyToDateTimeUTC, dynamicCount, 'Daily');

        showStatusMessage("Fetching weekly transaction data...", resultsContent);
        const weeklyToDateTimeUTC = formatDateForAPI(nowUTC);
        const weeklyFromDateObj = new Date(nowUTC.getTime() - (7 * 24 * 60 * 60 * 1000));
        const weeklyFromDateTimeUTC = formatDateForAPI(weeklyFromDateObj);
        weeklyTransactionStats = await fetchTransactionSpeedData(weeklyFromDateTimeUTC, weeklyToDateTimeUTC, dynamicCount, 'Weekly');
        
        return true;
    } catch (error) {
        showStatusMessage(`Error during data fetching: ${error.message}`, resultsContent);
        dailyTransactionStats = null;
        weeklyTransactionStats = null;
        return false;
    } finally {
        isFetchingApiData = false;
    }
}

function isBtcAddress(term) {
    term = term.toLowerCase();
    return (term.startsWith("bc1") || term.startsWith("1") || term.startsWith("3")) && term.length > 25 && term.length < 65;
}

function clearSearchResults() {
    resultsContent.innerHTML = '';
}

function showStatusMessage(message, container = resultsContent) {
    clearSearchResults();
    const p = document.createElement('p');
    p.className = 'status-message';
    p.textContent = message;
    container.appendChild(p);
}

function displayAddressRanks(searchTerm, dailyRankInfo, weeklyRankInfo) {
    clearSearchResults();

    const searchedAddressDiv = document.createElement('div');
    searchedAddressDiv.className = 'searched-address-display';
    searchedAddressDiv.innerHTML = `<span class="label">Address:</span> ${searchTerm}`;
    resultsContent.appendChild(searchedAddressDiv);

    const ranksContainer = document.createElement('div');
    ranksContainer.className = 'ranks-container';

    // Daily Rank Block
    const dailyBlock = document.createElement('div');
    dailyBlock.className = 'rank-block';
    let dailyRankHTML = `<h5>Daily Rank</h5>`; // (Last 24h UTC)
    if (dailyRankInfo.rank !== "Not Ranked") {
        dailyRankHTML += `<span class="rank-value">${dailyRankInfo.rank}</span>`;
        dailyRankHTML += `<span class="rank-details">out of ${dailyRankInfo.totalRecords} active addresses</span>`;
    } else {
        dailyRankHTML += `<span class="rank-value not-ranked">Not Ranked</span>`;
        dailyRankHTML += `<span class="rank-details">(Total daily addresses: ${dailyRankInfo.totalRecords})</span>`;
    }
    dailyBlock.innerHTML = dailyRankHTML;
    ranksContainer.appendChild(dailyBlock);

    // Weekly Rank Block
    const weeklyBlock = document.createElement('div');
    weeklyBlock.className = 'rank-block';
    let weeklyRankHTML = `<h5>Weekly Rank</h5>`; // (Last 7d UTC)
    if (weeklyRankInfo.rank !== "Not Ranked") {
        weeklyRankHTML += `<span class="rank-value">${weeklyRankInfo.rank}</span>`;
        weeklyRankHTML += `<span class="rank-details">out of ${weeklyRankInfo.totalRecords} active addresses</span>`;
    } else {
        weeklyRankHTML += `<span class="rank-value not-ranked">Not Ranked</span>`;
        weeklyRankHTML += `<span class="rank-details">(Total weekly addresses: ${weeklyRankInfo.totalRecords})</span>`;
    }
    weeklyBlock.innerHTML = weeklyRankHTML;
    ranksContainer.appendChild(weeklyBlock);

    resultsContent.appendChild(ranksContainer);
}

async function performSearch() {
    const searchTerm = searchInput.value.trim();
    clearSearchResults();
    if (!searchTerm) {
        showStatusMessage('Please enter a BTC address.');
        return;
    }
    if (isBtcAddress(searchTerm)) {
        const fetchSuccessful = await triggerFullDataFetchOnSearch();
        if (!fetchSuccessful && !isFetchingApiData) {
            // Error message already shown by triggerFullDataFetchOnSearch or other status
            return;
        }
        if (isFetchingApiData) return; // Should be handled by trigger, but safeguard

        const dailyRankInfo = { rank: "Not Ranked", totalRecords: 0 };
        if (dailyTransactionStats && Array.isArray(dailyTransactionStats)) {
            dailyRankInfo.totalRecords = dailyTransactionStats.length;
            const foundDailyIndex = dailyTransactionStats.findIndex(tx => tx.btcAddress && tx.btcAddress.toLowerCase() === searchTerm.toLowerCase());
            if (foundDailyIndex !== -1) dailyRankInfo.rank = foundDailyIndex + 1;
        }

        const weeklyRankInfo = { rank: "Not Ranked", totalRecords: 0 };
        if (weeklyTransactionStats && Array.isArray(weeklyTransactionStats)) {
            weeklyRankInfo.totalRecords = weeklyTransactionStats.length;
            const foundWeeklyIndex = weeklyTransactionStats.findIndex(tx => tx.btcAddress && tx.btcAddress.toLowerCase() === searchTerm.toLowerCase());
            if (foundWeeklyIndex !== -1) weeklyRankInfo.rank = foundWeeklyIndex + 1;
        }
        
        if (dailyTransactionStats || weeklyTransactionStats) { // If at least one dataset was processed
            displayAddressRanks(searchTerm, dailyRankInfo, weeklyRankInfo);
        } else if (!isFetchingApiData) {
            showStatusMessage('Data could not be fetched or is unavailable. Please try again.', resultsContent);
        }
    } else {
        showStatusMessage(`"${searchTerm}" is not a valid BTC address format. Please enter a valid BTC address.`);
    }
}

searchButton.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        performSearch();
    }
});