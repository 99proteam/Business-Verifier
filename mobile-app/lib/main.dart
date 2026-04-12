import "dart:convert";

import "package:cloud_firestore/cloud_firestore.dart";
import "package:firebase_auth/firebase_auth.dart";
import "package:firebase_core/firebase_core.dart";
import "package:firebase_messaging/firebase_messaging.dart";
import "package:flutter/foundation.dart";
import "package:flutter/material.dart";
import "package:google_sign_in/google_sign_in.dart";
import "package:http/http.dart" as http;

const _apiBaseUrl = String.fromEnvironment("API_BASE_URL", defaultValue: "http://localhost:3000");
const _apiKey = String.fromEnvironment("FIREBASE_API_KEY", defaultValue: "");
const _appId = String.fromEnvironment("FIREBASE_APP_ID", defaultValue: "");
const _senderId = String.fromEnvironment("FIREBASE_MESSAGING_SENDER_ID", defaultValue: "");
const _projectId = String.fromEnvironment("FIREBASE_PROJECT_ID", defaultValue: "");
const _authDomain = String.fromEnvironment("FIREBASE_AUTH_DOMAIN", defaultValue: "");
const _storageBucket = String.fromEnvironment("FIREBASE_STORAGE_BUCKET", defaultValue: "");

Uri _apiUri(String path) {
  final base = _apiBaseUrl.endsWith("/") ? _apiBaseUrl.substring(0, _apiBaseUrl.length - 1) : _apiBaseUrl;
  return Uri.parse("$base$path");
}

Future<Map<String, dynamic>> _authedPost(User user, String path, Map<String, dynamic> body) async {
  final idToken = await user.getIdToken();
  final response = await http.post(
    _apiUri(path),
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer $idToken",
    },
    body: jsonEncode(body),
  );
  final data = jsonDecode(response.body) as Map<String, dynamic>;
  if (response.statusCode >= 400 || data["ok"] != true) {
    throw Exception("${data["error"] ?? "Request failed"}");
  }
  return data;
}

Future<Map<String, dynamic>> _authedGet(User user, String path) async {
  final idToken = await user.getIdToken();
  final response = await http.get(
    _apiUri(path),
    headers: {
      "authorization": "Bearer $idToken",
    },
  );
  final data = jsonDecode(response.body) as Map<String, dynamic>;
  if (response.statusCode >= 400 || data["ok"] != true) {
    throw Exception("${data["error"] ?? "Request failed"}");
  }
  return data;
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(
      options: FirebaseOptions(
        apiKey: _apiKey,
        appId: _appId,
        messagingSenderId: _senderId,
        projectId: _projectId,
        authDomain: _authDomain.isEmpty ? null : _authDomain,
        storageBucket: _storageBucket.isEmpty ? null : _storageBucket,
      ),
    );
    runApp(const App());
  } catch (error) {
    runApp(MaterialApp(home: Scaffold(body: Center(child: Text("Firebase init error: $error")))));
  }
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: "Business Verifier",
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1D4ED8))),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        final user = snapshot.data;
        if (user == null) return const SignInPage();
        return UserShell(user: user);
      },
    );
  }
}

class SignInPage extends StatefulWidget {
  const SignInPage({super.key});
  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _error;
  bool _busy = false;

  Future<void> _login() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _email.text.trim(),
        password: _password.text.trim(),
      );
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _create() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: _email.text.trim(),
        password: _password.text.trim(),
      );
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _google() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final account = await GoogleSignIn.instance.authenticate();
      final auth = account.authentication;
      await FirebaseAuth.instance.signInWithCredential(
        GoogleAuthProvider.credential(idToken: auth.idToken),
      );
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SizedBox(
          width: 380,
          child: Card(
            margin: const EdgeInsets.all(16),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text("Business Verifier", style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                TextField(controller: _email, decoration: const InputDecoration(border: OutlineInputBorder(), labelText: "Email")),
                const SizedBox(height: 8),
                TextField(controller: _password, obscureText: true, decoration: const InputDecoration(border: OutlineInputBorder(), labelText: "Password")),
                if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: Colors.red))),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(child: FilledButton(onPressed: _busy ? null : _login, child: const Text("Login"))),
                  const SizedBox(width: 8),
                  Expanded(child: OutlinedButton(onPressed: _busy ? null : _create, child: const Text("Create"))),
                ]),
                const SizedBox(height: 8),
                OutlinedButton.icon(onPressed: _busy ? null : _google, icon: const Icon(Icons.login), label: const Text("Google login")),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class UserShell extends StatefulWidget {
  const UserShell({super.key, required this.user});
  final User user;
  @override
  State<UserShell> createState() => _UserShellState();
}

class _UserShellState extends State<UserShell> {
  int _tab = 0;
  @override
  void initState() {
    super.initState();
    _ensureProfile();
    _registerPush();
  }

  Future<void> _ensureProfile() async {
    final ref = FirebaseFirestore.instance.collection("users").doc(widget.user.uid);
    final snap = await ref.get();
    final payload = {
      "uid": widget.user.uid,
      "email": widget.user.email ?? "",
      "emailNormalized": (widget.user.email ?? "").toLowerCase(),
      "displayName": widget.user.displayName ?? "User",
      "role": (snap.data()?["role"] ?? "customer"),
      "roleSelectionCompleted": (snap.data()?["roleSelectionCompleted"] ?? false),
      "updatedAt": FieldValue.serverTimestamp(),
    };
    await ref.set({
      ...payload,
      if (!snap.exists) "createdAt": FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  Future<void> _registerPush() async {
    try {
      await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await _pushCall("/api/mobile/push/register", {"token": token, "platform": kIsWeb ? "web" : defaultTargetPlatform.name});
      FirebaseMessaging.instance.onTokenRefresh.listen((next) {
        _pushCall("/api/mobile/push/register", {"token": next, "platform": kIsWeb ? "web" : defaultTargetPlatform.name});
      });
    } catch (_) {}
  }

  Future<void> _pushCall(String path, Map<String, dynamic> body) async {
    final idToken = await widget.user.getIdToken();
    final base = _apiBaseUrl.endsWith("/") ? _apiBaseUrl.substring(0, _apiBaseUrl.length - 1) : _apiBaseUrl;
    await http.post(
      Uri.parse("$base$path"),
      headers: {"content-type": "application/json", "authorization": "Bearer $idToken"},
      body: jsonEncode(body),
    );
  }

  Future<void> _logout() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await _pushCall("/api/mobile/push/unregister", {"token": token});
    } catch (_) {}
    await FirebaseAuth.instance.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      const BusinessListPage(),
      ListingPage(user: widget.user),
      OrderPage(user: widget.user),
      TicketPage(user: widget.user),
      NotificationPage(user: widget.user),
      ProfilePage(user: widget.user),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text("Business Verifier"), actions: [IconButton(onPressed: _logout, icon: const Icon(Icons.logout))]),
      body: pages[_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (v) => setState(() => _tab = v),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.store), label: "Business"),
          NavigationDestination(icon: Icon(Icons.shopping_bag), label: "Listings"),
          NavigationDestination(icon: Icon(Icons.receipt_long), label: "Orders"),
          NavigationDestination(icon: Icon(Icons.support_agent), label: "Tickets"),
          NavigationDestination(icon: Icon(Icons.notifications), label: "Alerts"),
          NavigationDestination(icon: Icon(Icons.person), label: "Profile"),
        ],
      ),
    );
  }
}

class BusinessListPage extends StatelessWidget {
  const BusinessListPage({super.key});
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection("businessApplications").where("status", isEqualTo: "approved").limit(20).snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final docs = snapshot.data!.docs;
        return ListView.builder(
          itemCount: docs.length,
          itemBuilder: (context, i) {
            final d = docs[i].data();
            return ListTile(
              title: Text("${d["businessName"] ?? "Business"}"),
              subtitle: Text("${d["category"] ?? "General"} | ${d["city"] ?? ""}"),
            );
          },
        );
      },
    );
  }
}

class ListingPage extends StatefulWidget {
  const ListingPage({super.key, required this.user});
  final User user;
  @override
  State<ListingPage> createState() => _ListingPageState();
}

class _ListingPageState extends State<ListingPage> {
  bool _buying = false;
  String? _buyError;
  String? _buyInfo;

  Future<void> _buyProduct(Map<String, dynamic> product) async {
    final slug = "${product["uniqueLinkSlug"] ?? ""}".trim();
    if (slug.isEmpty) {
      setState(() => _buyError = "This product has no checkout slug.");
      return;
    }
    setState(() {
      _buying = true;
      _buyError = null;
      _buyInfo = null;
    });
    try {
      final createRes = await _authedPost(widget.user, "/api/payments/intents/create", {
        "purpose": "product_checkout",
        "provider": "mock",
        "currency": "INR",
        "ownerUid": widget.user.uid,
        "ownerName": widget.user.displayName ?? "User",
        "ownerEmail": widget.user.email ?? "",
        "productSlug": slug,
      });
      final intent = (createRes["intent"] as Map<String, dynamic>? ?? {});
      final intentId = "${intent["id"] ?? ""}";
      if (intentId.isEmpty) throw Exception("Intent ID missing.");
      final confirmRes = await _authedPost(widget.user, "/api/payments/intents/confirm", {
        "intentId": intentId,
      });
      final result = confirmRes["result"] as Map<String, dynamic>? ?? {};
      setState(() {
        _buyInfo = "Order created successfully. Order ID: ${result["orderId"] ?? "N/A"}";
      });
    } catch (error) {
      setState(() {
        _buyError = error.toString();
      });
    } finally {
      if (mounted) setState(() => _buying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(12, 12, 12, 6),
          child: Text("Products", style: TextStyle(fontWeight: FontWeight.bold)),
        ),
        if (_buyInfo != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Text(_buyInfo!, style: const TextStyle(color: Colors.green)),
          ),
        if (_buyError != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Text(_buyError!, style: const TextStyle(color: Colors.red)),
          ),
        SizedBox(
          height: 250,
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: FirebaseFirestore.instance.collection("digitalProducts").limit(30).snapshots(),
            builder: (context, snapshot) {
              if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
              final docs = snapshot.data!.docs;
              return ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: docs.length,
                itemBuilder: (context, i) {
                  final d = docs[i].data();
                  return SizedBox(
                    width: 260,
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text("${d["title"] ?? "Product"}", maxLines: 2, overflow: TextOverflow.ellipsis),
                            const SizedBox(height: 6),
                            Text("INR ${d["price"] ?? 0}"),
                            const SizedBox(height: 8),
                            Text("${d["description"] ?? ""}", maxLines: 3, overflow: TextOverflow.ellipsis),
                            const Spacer(),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton(
                                onPressed: _buying ? null : () => _buyProduct(d),
                                child: Text(_buying ? "Processing..." : "Buy"),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(12, 12, 12, 6),
          child: Text("Services", style: TextStyle(fontWeight: FontWeight.bold)),
        ),
        StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance.collection("businessServices").limit(30).snapshots(),
          builder: (context, snapshot) {
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
            final docs = snapshot.data!.docs;
            if (docs.isEmpty) {
              return const Padding(
                padding: EdgeInsets.all(12),
                child: Text("No services listed yet."),
              );
            }
            return Column(
              children: docs.map((doc) {
                final d = doc.data();
                return ListTile(
                  title: Text("${d["title"] ?? "Service"}"),
                  subtitle: Text("${d["ownerName"] ?? "Business"} | ${d["mode"] ?? "service"}"),
                );
              }).toList(),
            );
          },
        ),
      ],
    );
  }
}

class OrderPage extends StatelessWidget {
  const OrderPage({super.key, required this.user});
  final User user;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection("users").doc(user.uid).snapshots(),
      builder: (context, profileSnap) {
        final role = "${profileSnap.data?.data()?["role"] ?? "customer"}";
        return ListView(
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(12, 12, 12, 6),
              child: Text("My Orders", style: TextStyle(fontWeight: FontWeight.bold)),
            ),
            StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection("orders")
                  .where("customerUid", isEqualTo: user.uid)
                  .limit(120)
                  .snapshots(),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                final docs = snapshot.data!.docs;
                if (docs.isEmpty) {
                  return const ListTile(
                    title: Text("No customer orders yet."),
                  );
                }
                return Column(
                  children: docs.map((doc) {
                    final d = doc.data();
                    return ListTile(
                      title: Text("${d["productTitle"] ?? "Order"}"),
                      subtitle: Text("Order ${doc.id} | ${d["status"] ?? "paid"} | INR ${d["amount"] ?? 0}"),
                    );
                  }).toList(),
                );
              },
            ),
            if (role == "business_owner") ...[
              const Padding(
                padding: EdgeInsets.fromLTRB(12, 16, 12, 6),
                child: Text("Business Orders", style: TextStyle(fontWeight: FontWeight.bold)),
              ),
              StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                stream: FirebaseFirestore.instance
                    .collection("orders")
                    .where("businessOwnerUid", isEqualTo: user.uid)
                    .limit(120)
                    .snapshots(),
                builder: (context, snapshot) {
                  if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
                  final docs = snapshot.data!.docs;
                  if (docs.isEmpty) {
                    return const ListTile(
                      title: Text("No business orders yet."),
                    );
                  }
                  return Column(
                    children: docs.map((doc) {
                      final d = doc.data();
                      return ListTile(
                        title: Text("${d["productTitle"] ?? "Order"}"),
                        subtitle: Text("Customer ${d["customerName"] ?? ""} | ${d["status"] ?? "paid"} | INR ${d["amount"] ?? 0}"),
                      );
                    }).toList(),
                  );
                },
              ),
            ],
          ],
        );
      },
    );
  }
}

class TicketPage extends StatelessWidget {
  const TicketPage({super.key, required this.user});
  final User user;
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection("supportTickets").where("participantUids", arrayContains: user.uid).limit(100).snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        return ListView(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: FilledButton.icon(
                onPressed: () async => _createTicket(context, user),
                icon: const Icon(Icons.add),
                label: const Text("Create support ticket"),
              ),
            ),
            ...snapshot.data!.docs.map((doc) {
              final d = doc.data();
              return ListTile(title: Text("${d["title"] ?? "Ticket"}"), subtitle: Text("${d["businessName"] ?? ""} | ${d["status"] ?? "open"}"));
            }),
          ],
        );
      },
    );
  }

  static Future<void> _createTicket(BuildContext context, User user) async {
    final businesses = await FirebaseFirestore.instance
        .collection("businessApplications")
        .where("status", isEqualTo: "approved")
        .limit(300)
        .get();
    if (businesses.docs.isEmpty) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("No listed business found.")));
      }
      return;
    }

    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final expectedCtrl = TextEditingController(text: "Fix issue or refund");
    final searchCtrl = TextEditingController();
    String? selectedBusinessId = businesses.docs.first.id;

    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            final query = searchCtrl.text.trim().toLowerCase();
            final filtered = businesses.docs.where((doc) {
              final d = doc.data();
              final text = "${d["businessName"] ?? ""} ${d["city"] ?? ""} ${d["country"] ?? ""}".toLowerCase();
              return query.isEmpty || text.contains(query);
            }).toList();
            if (selectedBusinessId == null ||
                filtered.where((doc) => doc.id == selectedBusinessId).isEmpty) {
              selectedBusinessId = filtered.isNotEmpty ? filtered.first.id : null;
            }
            return Padding(
              padding: EdgeInsets.only(
                left: 12,
                right: 12,
                top: 12,
                bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 12,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text("Create support ticket", style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    TextField(
                      controller: searchCtrl,
                      onChanged: (_) => setSheetState(() {}),
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        labelText: "Search business",
                      ),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      value: selectedBusinessId,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        labelText: "Select listed business",
                      ),
                      items: filtered
                          .take(120)
                          .map((doc) => DropdownMenuItem<String>(
                                value: doc.id,
                                child: Text("${doc.data()["businessName"] ?? doc.id}"),
                              ))
                          .toList(),
                      onChanged: (value) => setSheetState(() => selectedBusinessId = value),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: titleCtrl,
                      decoration: const InputDecoration(border: OutlineInputBorder(), labelText: "Title"),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: descCtrl,
                      maxLines: 3,
                      decoration: const InputDecoration(border: OutlineInputBorder(), labelText: "Issue"),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: expectedCtrl,
                      decoration: const InputDecoration(border: OutlineInputBorder(), labelText: "Expected outcome"),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () {
                          if (selectedBusinessId == null ||
                              titleCtrl.text.trim().isEmpty ||
                              descCtrl.text.trim().isEmpty ||
                              expectedCtrl.text.trim().isEmpty) {
                            ScaffoldMessenger.of(sheetContext).showSnackBar(
                              const SnackBar(content: Text("All fields are required.")),
                            );
                            return;
                          }
                          Navigator.of(sheetContext).pop(true);
                        },
                        child: const Text("Submit"),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (submitted != true || selectedBusinessId == null) return;
    final selected = businesses.docs.firstWhere((doc) => doc.id == selectedBusinessId);
    final business = selected.data();
    await FirebaseFirestore.instance.collection("supportTickets").add({
      "customerUid": user.uid,
      "customerName": user.displayName ?? "Customer",
      "customerEmail": user.email ?? "",
      "businessId": selected.id,
      "businessSlug": "${business["slug"] ?? ""}",
      "businessName": "${business["businessName"] ?? "Business"}",
      "title": titleCtrl.text.trim(),
      "description": descCtrl.text.trim(),
      "priority": "medium",
      "expectedOutcome": expectedCtrl.text.trim(),
      "evidenceUrls": <String>[],
      "status": "open",
      "participantUids": [user.uid, "${business["ownerUid"] ?? ""}"]
        ..removeWhere((x) => x.trim().isEmpty),
      "createdAt": FieldValue.serverTimestamp(),
      "updatedAt": FieldValue.serverTimestamp(),
    });
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Ticket created.")));
    }
  }
}

class NotificationPage extends StatelessWidget {
  const NotificationPage({super.key, required this.user});
  final User user;
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection("users").doc(user.uid).collection("notifications").orderBy("createdAt", descending: true).limit(200).snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final docs = snapshot.data!.docs;
        return ListView.builder(
          itemCount: docs.length,
          itemBuilder: (context, i) {
            final d = docs[i].data();
            return ListTile(title: Text("${d["title"] ?? "Notification"}"), subtitle: Text("${d["message"] ?? ""}"));
          },
        );
      },
    );
  }
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key, required this.user});
  final User user;
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection("users").doc(user.uid).snapshots(),
      builder: (context, snapshot) {
        final data = snapshot.data?.data() ?? {};
        return ListView(
          padding: const EdgeInsets.all(12),
          children: [
            ListTile(title: const Text("Email"), subtitle: Text(user.email ?? "")),
            ListTile(title: const Text("UID"), subtitle: Text(user.uid)),
            ListTile(title: const Text("Role"), subtitle: Text("${data["role"] ?? "customer"}")),
            const Divider(),
            const Text("Customer: browse listings, buy, raise tickets."),
            const Text("Employee: operate assigned business tasks."),
            const Text("Business owner: manage listings and customer support."),
            const SizedBox(height: 12),
            TruecallerVerificationCard(user: user),
          ],
        );
      },
    );
  }
}

class TruecallerVerificationCard extends StatefulWidget {
  const TruecallerVerificationCard({super.key, required this.user});
  final User user;

  @override
  State<TruecallerVerificationCard> createState() => _TruecallerVerificationCardState();
}

class _TruecallerVerificationCardState extends State<TruecallerVerificationCard> {
  final _phone = TextEditingController();
  final _countryCode = TextEditingController(text: "+91");
  final _token = TextEditingController();
  final _requestId = TextEditingController();
  bool _loading = false;
  bool _verified = false;
  String _provider = "";
  String? _error;
  String? _info;

  @override
  void initState() {
    super.initState();
    _loadStatus();
  }

  @override
  void dispose() {
    _phone.dispose();
    _countryCode.dispose();
    _token.dispose();
    _requestId.dispose();
    super.dispose();
  }

  Future<void> _loadStatus() async {
    try {
      final res = await _authedGet(widget.user, "/api/auth/truecaller/verify");
      final result = res["result"] as Map<String, dynamic>? ?? {};
      setState(() {
        _verified = result["verified"] == true;
        _provider = "${result["provider"] ?? ""}";
        _phone.text = "${result["phoneNumber"] ?? _phone.text}";
      });
    } catch (_) {}
  }

  Future<void> _verify() async {
    setState(() {
      _loading = true;
      _error = null;
      _info = null;
    });
    try {
      final res = await _authedPost(widget.user, "/api/auth/truecaller/verify", {
        "phoneNumber": _phone.text.trim(),
        "countryCode": _countryCode.text.trim(),
        "verificationToken": _token.text.trim(),
        "requestId": _requestId.text.trim(),
      });
      final result = res["result"] as Map<String, dynamic>? ?? {};
      setState(() {
        _verified = result["verified"] == true;
        _provider = "${result["provider"] ?? ""}";
        _info = _verified
            ? "Truecaller verification successful."
            : "Truecaller verification failed.";
      });
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Truecaller Verification", style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            Text(_verified
                ? "Status: Verified (${_provider.isEmpty ? "provider" : _provider})"
                : "Status: Not verified"),
            const SizedBox(height: 8),
            TextField(
              controller: _countryCode,
              decoration: const InputDecoration(border: OutlineInputBorder(), labelText: "Country code"),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _phone,
              decoration: const InputDecoration(border: OutlineInputBorder(), labelText: "Phone number"),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _token,
              decoration: const InputDecoration(border: OutlineInputBorder(), labelText: "Verification token"),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _requestId,
              decoration: const InputDecoration(border: OutlineInputBorder(), labelText: "Request ID (optional)"),
            ),
            if (_info != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_info!, style: const TextStyle(color: Colors.green))),
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: Colors.red))),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _loading ? null : _verify,
                child: Text(_loading ? "Verifying..." : "Verify with Truecaller"),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
