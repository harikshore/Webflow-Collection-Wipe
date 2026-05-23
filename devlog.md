# Some flashback..
I built a CLI tool 2 years ago -- The "Webflow Collection De-referencer". The tool basically takes in a list of collections in a Webflow site and unsets any reference/multi-reference fields. 

This idea basically roots from my experience dealing with collections with large number of items & complex data models involving two way relationships. 

Its really frustrating when you want to bulk delete items from these collections. To delete an item from such a collection, you gotta de-reference any reference made to this item from other collections. Imagine 100s of items in other collection referencing this item you want to delete.

De-referencer solved this problem. 

I wondered in this similar line, why don't I build a tool that wipes given collections clean (Delete all items).

# Webflow Collection Wipe
This tool should take a list of collections in a Webflow site and wipe them clean.

## AI Assisted Programming
Its been 2 years since De-referencer tool, Now all of us are building using AI. While building using AI is the new norm, You can't just copy-paste AI generated tool to make it work. And just working code isn't enough to make it efficient. Tbh, with enough context, Claude built a working version of the "Webflow Collection Wipe" tool in the first attempt. Lol. But I did some really interesting research & design decisions that I am here to share about.

## Design Decisions

### CMS Locale Handling
Localization is now a native feature of Webflow. Not the case 2 years back. So De-referencer didn't support handling of de-referencing items in various locale. But I decided to support this on Collection Wipe. The tool basically asks you for the CMS Locale Ids in which you want to wipe the collections in. If you leave this ask blank, it defaults to only deleting all items in the primary locale of the collection (API default as well).

### Conflict Handling

#### Some glossary
Wipe Collection -> Collection we're trying to wipe
Wipe Item -> Collection item that we're trying to delete
Conflicting Collection -> Collection that references our Wipe collection. 
Conflicting Item -> Collection item that references our current wipe item

If the wipe item is referenced somewhere, the operation fails. And similarly, if you are trying to delete a batch of wipe items, Even if one wipe item is referenced in another collection, the entire batch fails (Webflow fails fast). A failed delete operation gives us a response: The conflicting items & the collection id of the conflicting collection. To delete this item, we got to de-reference the conflicting item fields that point to the wipe item. We could de-reference only the conflicting item and retry deleting, but this would be very slow and API call heavy.

Key Insight: We are wiping given collections clean and a reference/multi-reference field can only point to one specific collection. So instead of just de-referencing one conflicting item, we find the field in the conflicting collection that references our wipe collection, and unset that field on every single item in that conflicting collection. This means when you retry the bulk delete operation, the wipe collection will never face a conflict from the same collection. However, it might face a conflict from some other collection that will be handled in this same way.

### COMPLETE WIPE

While testing the whole tool, I thought it'd be nice to have an easier option where you choose to do a COMPLETE WIPE of your Webflow Site's CMS. I mean honestly most people would want this if they are setting up some kind of boilerplate for some repeat kind of website. So i added a flow where, if you leave the "Enter collection ids" step blank, it fetches all Collection IDs & CMS locale ids for the provided token and WIPES ALL Collections in ALL locales for the site. But you explicitly have to confirm this action. 