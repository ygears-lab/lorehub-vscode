# Privacy Policy

**Last updated: September 8, 2026**

This extension places great importance on protecting your personal information, and sets out
the following privacy policy.

## 1. Information We Collect

### 1.1 GitHub Account Information
When you sign in with your GitHub account, we obtain the account information provided by
GitHub (your GitHub username, email address, and avatar URL).

### 1.2 Content You Create
We obtain and store the title, filename, body text, and created / updated timestamps of the
content you create using this extension.
We also obtain and store the labels you create and the associations between labels and files.

### 1.3 Information We Do Not Collect
This extension has no mechanism for collecting usage information (telemetry or analytics).
Nor does it read any file in your workspace other than those you explicitly ask it to import
or load.


## 2. Storage of Information
The information we collect is stored in a PostgreSQL database hosted by Supabase
(<https://supabase.com>), in the ap-northeast-1 region (Japan).
If you use this extension from outside Japan, this storage involves a cross-border transfer
of your data.

Every record in the database is protected by row-level security (RLS), so it cannot be viewed
or manipulated by other users.

In addition, your authentication token is stored on your machine in VS Code SecretStorage
(such as the OS keychain) and is never stored in plain text.
We also store a cached copy of the list of content and labels you have created on your machine,
so that they can be viewed offline. Both are deleted when you sign out.


## 3. Deletion of Data
When you delete a file in this extension, it is hidden from the list, but the record in the
database is not erased immediately; it is retained as deleted.

If you wish to delete your account and have your stored data completely erased, please contact
us at the address given in "Contact" at the end of this policy, from the email address
registered to your account. We will confirm your request, delete the data from the database,
and let you know once it is done.


## 4. Disclosure to Third Parties

We use only the following processors.

| Processor | Purpose |
| --- | --- |
| Supabase | Database hosting and authentication |
| GitHub | Sign-in provider |

We do not sell the content you create, and we do not share it for advertising or profiling
purposes. However, we may disclose it where required to do so by law.

## 5. Changes to This Policy

If we change this policy, we will update the date at the top and record the change in the
extension's [CHANGELOG](CHANGELOG.md). We will announce material changes in the release notes.

## 6. Contact
For inquiries about this policy, please contact
&#108;&#111;&#114;&#101;&#104;&#117;&#98;&lbrack;&#97;&#116;&rbrack;&#121;&#103;&#101;&#97;&#114;&#115;&period;&#99;&#111;&#109;.
