![Product Logo](https://github.com/harikshore/Webflow-Collection-Wipe/blob/5d0e0d8bdb41c24680d13d3d75dbec0ffa1f00a2/logo.png)

# Webflow Collection Wipe

This script helps you delete all items in given webflow collections. Basically "wipes" given collections. It also has the option to WIPE ALL collections in a Webflow site.

## Why

When dealing with Webflow projects that involve complex CMS architectures, Deleting all items in a Webflow collection requires huge manual effort. You got to delete items in batch of 50 for each collection. This task becomes a nightmare if you are dealing with thousands of items with CMS structures involving heavy reference/multi-reference fields.

These situations arise especially when you work in niche products that involve boilerplate setup where you would want to start a fresh CMS scene for different clients.

## ⚠️ Before You Begin: Create a Site Backup

**Always back up your Webflow site before running this tool.** This script DELETE all items in your CMS Collections that cannot be automatically undone. A backup ensures you can restore your content if something goes wrong.

## Usage 

### Prerequisites

Make sure you have Node.js installed before proceeding.

### Installation

1. Clone this repository,
2. Open the repository folder in a code editor like VS Code.
3. Open up a fresh terminal instance, then run:

```
npm install
```
Or if you prefer to use yarn, you can run:

```bash
yarn install
```

### Running the tool

1. Run:

```
npm start
```
Or

```
yarn start
```

### Commands 

#### First, get an API key for your Webflow site.

1. Go to your Webflow Dashboard.
2. Click the three dots on the desired Webflow site.
3. Click "Settings".
4. Click "Apps & Integrations".
5. Click "Generate API Token". (Important: make sure to pick the v2 API token, the blue button).
6. Under the "Generate API Token" dialog, give a name and grant "read and write" permissions for CMS. Additionally, If you are looking to WIPE ALL collections, also grant "read-only" permission for Sites.
7. Click "Generate Token"
8. Copy the API token and store it somewhere safe for later.

#### Get the Collection Ids of the collection to be wiped.
(Skip this step if you are using the Wipe All Collections option)

1. In your webflow designer, Open your CMS Panel
2. Open the Collection settings of the collection and copy the collection id. 
3. Copy the collection ids of all the collections you want to de-reference and store it somewhere for later.

#### After the tool is running successfully,

Input the API Key where it says: 
```
Enter your Webflow API token:
```


Then, Enter collection IDs, or leave blank to wipe all collections in the site: 
```
Enter your Webflow collection IDs (comma separated, or leave blank to wipe all collections):
```
Note: When choosing the WIPE ALL option, you have to explicitly confirm the action with a 'y' or 'yes'.


If you entered specific collection IDs, you will also be asked for locale numbers:
```
Enter locale numbers to wipe (comma separated or leave blank to wipe primary locale only): 
```
Note: All available locales along with numbers will be listed above. Leaving this blank will only wipe the primary locale. If you chose the WIPE ALL option all locales (primary and secondary) will be wiped automatically.

### Output

Sit back and relax while the script processes each collection and wipes them clean. 

After wiping is complete, publish your site in the designer for changes to take effect in LIVE site.

## Share your love
- Product Hunt: https://www.producthunt.com/products/webflow-collection-wipe

## Follow the creator
- Twitter: https://x.com/harikshore15
- Email: harikshoresridharan@gmail.com
