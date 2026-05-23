import fetch from 'node-fetch';
import readline from 'readline';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, { maxRetries = 5, baseDelayMs = 1000 } = {}) {
  let attempt = 0;

  while (true) {
    const { response, data } = await fn();

    if (response.status < 400) {
      console.log(`${response.status}`);
      return data;
    }

    if (response.status === 429) {
      if (attempt >= maxRetries) {
        throw new Error(`Rate limit persists after ${maxRetries} retries. Giving up.`);
      }
      const retryAfter = response.headers.get('retry-after');
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : Math.min(60000, baseDelayMs * 2 ** attempt);
      console.warn(`⚠ Rate limited. Waiting ${(waitMs / 1000).toFixed(1)}s before retry (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(waitMs);
      attempt++;
      continue;
    }

    if (response.status >= 500) {
      if (attempt >= maxRetries) {
        throw new Error(`Server error ${response.status} persists after ${maxRetries} retries.`);
      }
      const waitMs = baseDelayMs * 2 ** attempt;
      console.warn(`⚠ Server error ${response.status}. Retrying in ${(waitMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${maxRetries})...`);
      await sleep(waitMs);
      attempt++;
      continue;
    }

    // Non-retryable error (4xx excluding 429)
    throw new Error(`API error ${response.status}: ${JSON.stringify(data)}`);
  }
}

async function fetchWebflowAPI(url, method = 'GET', body = null, token) {
  const headers = {
    'authorization': `Bearer ${token}`,
    'accept-version': '2.0.0',
    'Content-Type': 'application/json',
    'accept': 'application/json'
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  return withRetry(async () => {
    const response = await fetch(url, options);
    const data = await response.json();
    return { response, data };
  });
}

async function listCollectionItems(collectionId, token) {
  let items = [];
  let offset = 0;
  let total = 0;

  do {
    const url = `https://api.webflow.com/v2/collections/${collectionId}/items?offset=${offset}&limit=100`;
    const response = await fetchWebflowAPI(url, undefined, undefined, token);
    items = items.concat(response.items);
    total = response.pagination.total;
    offset += 100;
  } while (offset < total);

  return items;
}

async function getCollectionDetails(collectionId, token) {
  const url = `https://api.webflow.com/v2/collections/${collectionId}`;
  const collection = await fetchWebflowAPI(url, undefined, undefined, token);

  return collection.fields
    .filter(field => field.type === 'Reference' || field.type === 'MultiReference')
    .map(field => ({
      type: field.type,
      slug: field.slug,
      referencedCollectionId: field.validations?.collectionId ?? null,
    }));
}

async function unsetReferencingFields(conflictingCollectionId, wipeCollectionId, cmsLocaleIds, token) {
  console.log(`Resolving: unsetting references to ${wipeCollectionId} in collection ${conflictingCollectionId}`);

  const referenceFields = await getCollectionDetails(conflictingCollectionId, token);
  const fieldsToUnset = referenceFields.filter(f => f.referencedCollectionId === wipeCollectionId);

  if (fieldsToUnset.length === 0) {
    console.warn(`⚠ No reference fields found pointing to ${wipeCollectionId} in ${conflictingCollectionId}. Skipping.`);
    return;
  }

  const items = await listCollectionItems(conflictingCollectionId, token);
  console.log(`Unsetting [${fieldsToUnset.map(f => f.slug).join(', ')}] on ${items.length} items in ${conflictingCollectionId}`);

  const fieldData = {};
  for (const field of fieldsToUnset) {
    fieldData[field.slug] = field.type === 'MultiReference' ? [] : '';
  }

  const entries = [];
  for (const item of items) {
    if (cmsLocaleIds.length === 0) {
      entries.push({ id: item.id, fieldData });
    } else {
      for (const localeId of cmsLocaleIds) {
        entries.push({ id: item.id, cmsLocaleId: localeId, fieldData });
      }
    }
  }

  const url = `https://api.webflow.com/v2/collections/${conflictingCollectionId}/items`;
  const totalBatches = Math.ceil(entries.length / 100);

  for (let i = 0; i < entries.length; i += 100) {
    const batch = entries.slice(i, i + 100);
    const batchNum = Math.floor(i / 100) + 1;
    console.log(`PATCH batch ${batchNum}/${totalBatches} (${batch.length} entries)...`);
    await fetchWebflowAPI(url, 'PATCH', { items: batch }, token);
  }

  console.log(`✓ Unset complete for ${conflictingCollectionId}`);
}

async function deleteItems(collectionId, items, cmsLocaleIds, token) {
  const batches = [];
  for (let i = 0; i < items.length; i += 100) {
    batches.push(items.slice(i, i + 100));
  }

  const url = `https://api.webflow.com/v2/collections/${collectionId}/items`;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`\nDeleting batch ${batchIndex + 1}/${batches.length} (${batch.length} items)...`);

    const buildBody = (batchItems) => ({
      items: batchItems.map(item => ({
        id: item.id,
        ...(cmsLocaleIds.length > 0 ? { cmsLocaleIds } : {}),
      })),
    });

    const resolvedCollections = new Set();

    while (true) {
      const headers = {
        'authorization': `Bearer ${token}`,
        'accept-version': '2.0.0',
        'Content-Type': 'application/json',
        'accept': 'application/json'
      };
      const response = await fetch(url, {
        method: 'DELETE',
        headers,
        body: JSON.stringify(buildBody(batch)),
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 10000;
        console.warn(`⚠ Rate limited on DELETE. Waiting ${(waitMs / 1000).toFixed(1)}s...`);
        await sleep(waitMs);
        continue;
      }

      if (response.status >= 500) {
        console.warn(`⚠ Server error ${response.status} on DELETE. Retrying in 5s...`);
        await sleep(5000);
        continue;
      }

      if (response.status === 409) {
        const data = await response.json();
        const conflicts = data?.details?.[0]?.conflicts ?? [];

        if (conflicts.length === 0) {
          throw new Error(`409 conflict with no parseable conflict details: ${JSON.stringify(data)}`);
        }

        const byCollection = {};
        for (const conflict of conflicts) {
          const refCollectionId = conflict.ref?.collectionId;
          if (!refCollectionId) continue;
          if (!byCollection[refCollectionId]) byCollection[refCollectionId] = [];
          byCollection[refCollectionId].push(conflict);
        }

        let anyNew = false;
        for (const conflictingCollectionId of Object.keys(byCollection)) {
          if (resolvedCollections.has(conflictingCollectionId)) {
            console.warn(`⚠ Already resolved ${conflictingCollectionId} but conflict persists. Skipping to avoid loop.`);
            continue;
          }
          await unsetReferencingFields(conflictingCollectionId, collectionId, cmsLocaleIds, token);
          resolvedCollections.add(conflictingCollectionId);
          anyNew = true;
        }

        if (!anyNew) {
          throw new Error(`Conflict loop: could not resolve remaining conflicts after multiple attempts.\n${JSON.stringify(data, null, 2)}`);
        }

        console.log(`Conflict resolved. Retrying delete for batch ${batchIndex + 1}...`);
        continue;
      }

      if (response.status < 400) {
        console.log(`${response.status} — batch ${batchIndex + 1} deleted.`);
        break;
      }

      const data = await response.json();
      throw new Error(`DELETE failed ${response.status}: ${JSON.stringify(data)}`);
    }
  }
}

async function getSiteDetails(token) {
  const data = await fetchWebflowAPI('https://api.webflow.com/v2/sites', undefined, undefined, token);
  const site = data.sites[0];

  // Build a flat ordered list of all locales: primary first, then secondary
  const allLocales = [
    { displayName: site.locales.primary.displayName, cmsLocaleId: site.locales.primary.cmsLocaleId, isPrimary: true },
    ...site.locales.secondary.map(l => ({ displayName: l.displayName, cmsLocaleId: l.cmsLocaleId, isPrimary: false })),
  ];

  return { siteId: site.id, displayName: site.displayName, allLocales };
}

async function getSiteCollectionIds(siteId, token) {
  const data = await fetchWebflowAPI(`https://api.webflow.com/v2/sites/${siteId}/collections`, undefined, undefined, token);
  return data.collections.map(c => c.id);
}

async function run() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question) => new Promise(resolve => rl.question(question, resolve));

  console.log("======================");
  console.log("🔄 WEBFLOW COLLECTION WIPE 🔄");
  console.log("======================");
  console.log("\n");

  const backup = await ask('Have you created a backup of your Webflow site? (yes/no): ');
  if (!['yes', 'y'].includes(backup.trim().toLowerCase())) { console.log('Aborted. Please create a site backup before proceeding.'); rl.close(); return; }

  const token = await ask('Enter your Webflow API token: ');

  console.log('\nFetching site details...');
  const { siteId, displayName, allLocales } = await getSiteDetails(token);

  const collectionIdsRaw = await ask('\nEnter your Webflow collection IDs (comma separated, or leave blank to wipe all collections): ');

  let collectionIds;
  let cmsLocaleIds;

  if (collectionIdsRaw.trim() === '') {
    // ── Wipe-all path ──────────────────────────────────────────────────────────
    // Use all locale IDs — enabled or not
    cmsLocaleIds = allLocales.map(l => l.cmsLocaleId);

    const confirm = await ask(`\nThis will wipe ALL collections in ALL locales in "${displayName}". Are you sure? (yes/no): `);
    rl.close();

    if (!['yes', 'y'].includes(confirm.trim().toLowerCase())) {
      console.log('Aborted.');
      return;
    }

    console.log('\nFetching all collection IDs...');
    collectionIds = await getSiteCollectionIds(siteId, token);
    console.log(`Found ${collectionIds.length} collections. Wiping all locales.\n`);

  } else {
    // ── Normal path ────────────────────────────────────────────────────────────
    collectionIds = collectionIdsRaw.split(',').map(id => id.trim()).filter(Boolean);

    // Present named locale list for the user to pick from
    console.log('\nAvailable locales:');
    allLocales.forEach((locale, index) => {
      const label = locale.isPrimary ? `${locale.displayName} (primary)` : locale.displayName;
      console.log(`  ${index + 1}. ${label}`);
    });

    const localeSelectionRaw = await ask('\nEnter locale numbers to wipe (comma separated or leave blank to wipe primary locale only): ');
    rl.close();

    if (localeSelectionRaw.trim() === '') {
      // Primary locale only — omit cmsLocaleIds entirely (Webflow API default)
      cmsLocaleIds = [];
      console.log('\nNo locale selected — wiping primary locale only.\n');
    } else {
      const selectedIndices = localeSelectionRaw.split(',').map(s => parseInt(s.trim(), 10) - 1);
      const invalidIndices = selectedIndices.filter(i => i < 0 || i >= allLocales.length || isNaN(i));

      if (invalidIndices.length > 0) {
        console.error(`✗ Invalid locale selection. Please enter numbers between 1 and ${allLocales.length}.`);
        rl.close();
        return;
      }

      cmsLocaleIds = selectedIndices.map(i => allLocales[i].cmsLocaleId);
      const selectedNames = selectedIndices.map(i => allLocales[i].displayName);
      console.log(`\nWiping locales: ${selectedNames.join(', ')}\n`);
    }
  }

  for (const collectionId of collectionIds) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Processing collection: ${collectionId}`);
    console.log('─'.repeat(60));

    try {
      const items = await listCollectionItems(collectionId, token);
      console.log(`Fetched ${items.length} items.`);

      if (items.length === 0) {
        console.log('Collection is already empty. Skipping.');
        continue;
      }

      await deleteItems(collectionId, items, cmsLocaleIds, token);
      console.log(`\n✓ Collection ${collectionId} wiped successfully.`);
    } catch (error) {
      console.error(`\n✗ Error wiping collection ${collectionId}:`, error.message);
    }
  }

  console.log('\nDone.');
}

run();