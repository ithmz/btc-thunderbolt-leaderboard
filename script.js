const searchInput = document.querySelector('.search-box');
const searchButton = document.querySelector('.search-button');
const resultsContent = document.querySelector('.search-results-content');

let dailyTransactionStats = null;
let weeklyTransactionStats = null;
let isFetchingApiData = false;
let isFetchingActiveUserCount = false;

// --- Total Transaction Reward Tiers Definition ---
const transactionRewardTiers = [ // Renamed for clarity
    { threshold: 1000, name: "@Spark role on Discord" },
    { threshold: 10000, name: "@Pulse role on Discord" },
    { threshold: 100000, name: "@Storm role on Discord" }
];

// --- Weekly Rank Prize Rewards Definition (NEW) ---
const weeklyRankPrizes = [
    { rank: 1, reward: "🥇 $50 + @Speed Master role" },
    { rank: 2, reward: "🥈 $25" },
    { rank: 3, reward: "🥉 $10" },
    { rankMin: 4, rankMax: 10, reward: "$3 each" }
    // Ranks beyond 10 do not get a specific prize from this list
];


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

async function getTotalTransactions(address) {
  const apiUrl = `https://api.thunderbolt.lt/api/v1/addresses/${address}/transactions`;
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`API Error for total transactions: ${response.status} - ${response.statusText}`);
      console.error(`Error details: ${errorData}`);
      throw new Error(`Failed to fetch total transactions. Status: ${response.status}`);
    }
    const jsonData = await response.json();
    if (jsonData && jsonData.data && typeof jsonData.data.total !== 'undefined') {
      return jsonData.data.total;
    } else {
      console.error("Unexpected JSON structure for total transactions. 'data.total' not found.", jsonData);
      throw new Error("Could not find 'total' in the total transactions response data.");
    }
  } catch (error) {
    console.error("An error occurred fetching total transactions:", error.message);
    throw error;
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

function addRankBlocksToContainer(dailyRankInfo, weeklyRankInfo, container) {
    // Daily Rank Block
    const dailyBlock = document.createElement('div');
    dailyBlock.className = 'rank-block';
    let dailyRankHTML = `<h5>Daily Rank</h5>`;
    if (dailyRankInfo.rank !== "Not Ranked") {
        dailyRankHTML += `<span class="rank-value">${dailyRankInfo.rank}</span>`;
        dailyRankHTML += `<span class="rank-details">out of ${dailyRankInfo.totalRecords} active addresses</span>`;
    } else {
        dailyRankHTML += `<span class="rank-value not-ranked">Not Ranked</span>`;
        dailyRankHTML += `<span class="rank-details">(Total daily addresses: ${dailyRankInfo.totalRecords})</span>`;
    }
    dailyBlock.innerHTML = dailyRankHTML;
    container.appendChild(dailyBlock);

    // Weekly Rank Block
    const weeklyBlock = document.createElement('div');
    weeklyBlock.className = 'rank-block';
    let weeklyRankHTML = `<h5>Weekly Rank</h5>`;
    if (weeklyRankInfo.rank !== "Not Ranked") {
        weeklyRankHTML += `<span class="rank-value">${weeklyRankInfo.rank}</span>`;
        weeklyRankHTML += `<span class="rank-details">out of ${weeklyRankInfo.totalRecords} active addresses</span>`;
    } else {
        weeklyRankHTML += `<span class="rank-value not-ranked">Not Ranked</span>`;
        weeklyRankHTML += `<span class="rank-details">(Total weekly addresses: ${weeklyRankInfo.totalRecords})</span>`;
    }
    weeklyBlock.innerHTML = weeklyRankHTML;
    container.appendChild(weeklyBlock);
}

function displayTransactionRewardsBlock(totalTransactions, containerElement) { // Renamed for clarity
    if (typeof totalTransactions !== 'number' || !containerElement) {
        console.error("Invalid input for displayTransactionRewardsBlock");
        return;
    }

    const rewardsBlock = document.createElement('div');
    rewardsBlock.className = 'rank-block transaction-rewards-block'; // Specific class

    let rewardsHTML = `<h5>Total Transaction Rewards</h5>`; // Title updated
    rewardsHTML += `<p>Your total transactions: <strong>${totalTransactions.toLocaleString()}</strong></p>`;
    rewardsHTML += `<ul class="rewards-list">`;

    let highestAchievedRoleName = "None";
    let anyRewardAchieved = false;

    transactionRewardTiers.forEach(tier => { // Using renamed const
        if (totalTransactions >= tier.threshold) {
            rewardsHTML += `<li class="reward-item achieved">
                              <span class="reward-name">${tier.name}</span>
                              <span class="reward-status">(Unlocked at ${tier.threshold.toLocaleString()} transactions)</span>
                            </li>`;
            highestAchievedRoleName = tier.name;
            anyRewardAchieved = true;
        } else {
            const transactionsNeeded = tier.threshold - totalTransactions;
            rewardsHTML += `<li class="reward-item pending">
                              <span class="reward-name">${tier.name}</span>
                              <span class="reward-status">(Requires ${tier.threshold.toLocaleString()} transactions. You need ${transactionsNeeded.toLocaleString()} more)</span>
                            </li>`;
        }
    });
    rewardsHTML += `</ul>`;

    if (anyRewardAchieved) {
        rewardsHTML += `<p class="current-reward-summary">Your highest unlocked transaction role: <strong>${highestAchievedRoleName}</strong></p>`;
    } else if (transactionRewardTiers.length > 0) {
        rewardsHTML += `<p class="current-reward-summary">Keep transacting to unlock your first Discord role based on total transactions!</p>`;
    }

    rewardsBlock.innerHTML = rewardsHTML;
    containerElement.appendChild(rewardsBlock);
}

async function fetchAndAddTransactionRewardsToContainer(address, containerElement) { // Renamed
    const tempRewardsStatusDiv = document.createElement('div');
    tempRewardsStatusDiv.className = 'rank-block rewards-status-loading';
    tempRewardsStatusDiv.innerHTML = `<h5>Total Transaction Rewards</h5><p>Fetching your transaction rewards...</p>`;
    containerElement.appendChild(tempRewardsStatusDiv);

    try {
        const totalUserTransactions = await getTotalTransactions(address);
        containerElement.removeChild(tempRewardsStatusDiv);
        displayTransactionRewardsBlock(totalUserTransactions, containerElement); // Call renamed function
    } catch (error) {
        console.error("Error fetching total transactions for rewards:", error);
        tempRewardsStatusDiv.innerHTML = `<h5>Total Transaction Rewards</h5><p class="error-message">Could not load transaction rewards: ${error.message}</p>`;
    }
}

// --- Function to display Weekly Rank Prize Rewards (NEW) ---
function displayWeeklyRankPrizesBlock(userWeeklyRank, totalWeeklyParticipants, containerElement) {
    if (!containerElement) {
        console.error("Invalid container for displayWeeklyRankPrizesBlock");
        return;
    }

    const weeklyPrizesBlock = document.createElement('div');
    weeklyPrizesBlock.className = 'rank-block weekly-prize-rewards-block'; // Specific class

    let prizesHTML = `<h5>Weekly Rank Prizes</h5>`;

    if (userWeeklyRank === "Not Ranked" || typeof userWeeklyRank !== 'number' || userWeeklyRank <= 0) {
        prizesHTML += `<p>You are not currently ranked this week, or your rank is not eligible for prizes. Keep transacting to climb the leaderboard!</p>`;
        if (totalWeeklyParticipants > 0) {
             prizesHTML += `<p>(Current weekly participants: ${totalWeeklyParticipants})</p>`;
        }
    } else {
        let earnedPrize = null;
        for (const prizeTier of weeklyRankPrizes) {
            if (prizeTier.rank && userWeeklyRank === prizeTier.rank) {
                earnedPrize = prizeTier.reward;
                break;
            }
            if (prizeTier.rankMin && prizeTier.rankMax && userWeeklyRank >= prizeTier.rankMin && userWeeklyRank <= prizeTier.rankMax) {
                earnedPrize = prizeTier.reward;
                break;
            }
        }

        if (earnedPrize) {
            prizesHTML += `<p>Your weekly rank: <strong>${userWeeklyRank}</strong> out of ${totalWeeklyParticipants}</p>`;
            prizesHTML += `<p class="earned-prize">Congratulations! You've earned: <strong>${earnedPrize}</strong></p>`;
        } else {
            prizesHTML += `<p>Your weekly rank: <strong>${userWeeklyRank}</strong> out of ${totalWeeklyParticipants}</p>`;
            prizesHTML += `<p>You are ranked, but not within the prize tiers for this week. Aim for the top ${weeklyRankPrizes[weeklyRankPrizes.length-1].rankMax || weeklyRankPrizes[weeklyRankPrizes.length-1].rank}!</p>`;
        }

        prizesHTML += `<h6 style="margin-top:15px;">All Weekly Prize Tiers:</h6>`;
        prizesHTML += `<ul class="rewards-list">`; // Reusing rewards-list class for consistency
        weeklyRankPrizes.forEach(tier => {
            let tierLabel = "";
            if (tier.rank) {
                tierLabel = `Rank ${tier.rank}`;
            } else if (tier.rankMin && tier.rankMax) {
                tierLabel = `Ranks ${tier.rankMin} - ${tier.rankMax}`;
            }
            prizesHTML += `<li class="reward-item ${(earnedPrize && earnedPrize === tier.reward) ? 'achieved' : ''}">
                             <span class="reward-name">${tierLabel}:</span>
                             <span class="reward-status" style="display:inline; margin-left: 5px;">${tier.reward}</span>
                           </li>`;
        });
        prizesHTML += `</ul>`;
    }

    weeklyPrizesBlock.innerHTML = prizesHTML;
    containerElement.appendChild(weeklyPrizesBlock);
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
            if (resultsContent.innerHTML.trim() === '') {
                 showStatusMessage('Failed to fetch ranking data. Please try again.', resultsContent);
            }
            return;
        }
        if (isFetchingApiData) return;

        clearSearchResults();

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

        if (dailyTransactionStats || weeklyTransactionStats) {
            const searchedAddressDiv = document.createElement('div');
            searchedAddressDiv.className = 'searched-address-display';
            searchedAddressDiv.innerHTML = `<span class="label">Address:</span> ${searchTerm}`;
            resultsContent.appendChild(searchedAddressDiv);

            const ranksAndRewardsContainer = document.createElement('div');
            ranksAndRewardsContainer.className = 'ranks-rewards-container';
            resultsContent.appendChild(ranksAndRewardsContainer);

            addRankBlocksToContainer(dailyRankInfo, weeklyRankInfo, ranksAndRewardsContainer);

            // Fetch and Add Total Transaction Rewards
            // This is async, so it will append when ready.
            // We await it so the weekly rank prizes appear after.
            await fetchAndAddTransactionRewardsToContainer(searchTerm, ranksAndRewardsContainer);

            // Add Weekly Rank Prize Rewards Block (NEW)
            // This is synchronous based on already fetched weeklyRankInfo
            displayWeeklyRankPrizesBlock(weeklyRankInfo.rank, weeklyRankInfo.totalRecords, ranksAndRewardsContainer);

        } else if (!isFetchingApiData) {
            showStatusMessage('Ranking data could not be fetched or is unavailable. Please try again.', resultsContent);
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
