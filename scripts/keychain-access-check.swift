// Read-only, metadata-only inspection of MewLink's two legacy Keychain ACLs.
// Never requests password data, changes an ACL, or permits an authorization UI.
import Foundation
import Security

let identifier = CommandLine.arguments.dropFirst().first ?? "app.mewlink.desktop.qa"
guard identifier == "app.mewlink.desktop" || identifier == "app.mewlink.desktop.qa" || identifier.hasPrefix("app.mewlink.desktop.qa.") else {
    fatalError("Only MewLink release/QA identifiers are accepted")
}
for (suffix, account) in [("pairing", "pairing-v2"), ("ratchet", "anchor-v1")] {
    let service = "\(identifier).\(suffix)"
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
        kSecReturnRef as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
        kSecUseAuthenticationUI as String: kSecUseAuthenticationUIFail,
    ]
    var result: CFTypeRef?
    let found = SecItemCopyMatching(query as CFDictionary, &result)
    print("\(service): lookup=\(found)")
    guard found == errSecSuccess, let result else { continue }
    let item = result as! SecKeychainItem
    var access: SecAccess?
    guard SecKeychainItemCopyAccess(item, &access) == errSecSuccess, let access else { continue }
    var list: CFArray?
    guard SecAccessCopyACLList(access, &list) == errSecSuccess, let list else { continue }
    for acl in list as! [SecACL] {
        let tags = SecACLCopyAuthorizations(acl) as? [String] ?? []
        var applications: CFArray?
        var description: CFString?
        var prompt = SecKeychainPromptSelector(rawValue: 0)
        let status = SecACLCopyContents(acl, &applications, &description, &prompt)
        guard status == errSecSuccess else { print("  acl metadata=\(status)"); continue }
        let apps = applications as? [SecTrustedApplication]
        print("  tags=\(tags) trusted=\(apps.map { String($0.count) } ?? "all") prompt=\(prompt.rawValue)")
        if tags.contains(kSecACLAuthorizationPartitionID as String), let description {
            // Partition identities are signature metadata, not the item data.
            let hex = description as String
            let bytes = stride(from: 0, to: hex.count - 1, by: 2).compactMap { offset -> UInt8? in
                let start = hex.index(hex.startIndex, offsetBy: offset)
                return UInt8(hex[start..<hex.index(start, offsetBy: 2)], radix: 16)
            }
            if let plist = try? PropertyListSerialization.propertyList(from: Data(bytes), format: nil) as? [String: Any] {
                print("  partitions=\(plist["Partitions"] as? [String] ?? [])")
            }
        }
    }
}
