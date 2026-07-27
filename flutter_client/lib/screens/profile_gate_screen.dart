import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';

import '../providers/auth_provider.dart';
import '../providers/theme_provider.dart';
import '../api/api_client.dart';

const List<String> swatches = [
  '#e50914', // Red
  '#1f9cff', // Blue
  '#21c07a', // Green
  '#f5a623', // Yellow
  '#9b59b6', // Purple
  '#ff6b9d'  // Pink
];

class ProfileGateScreen extends StatefulWidget {
  const ProfileGateScreen({super.key});

  @override
  State<ProfileGateScreen> createState() => _ProfileGateScreenState();
}

class _ProfileGateScreenState extends State<ProfileGateScreen> {
  final _nameController = TextEditingController();
  bool _adding = false;
  String _selectedColor = swatches[0];
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _createProfile() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    final auth = context.read<AuthProvider>();

    try {
      await ApiClient().createProfile({
        'name': name,
        'color': _selectedColor,
      });
      await auth.refreshProfiles();
      setState(() {
        _adding = false;
        _nameController.clear();
        _selectedColor = swatches[0];
      });
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _busy = false);
    }
  }

  Color _parseHexColor(String hex) {
    hex = hex.replaceFirst('#', '');
    if (hex.length == 6) {
      hex = 'FF$hex';
    }
    return Color(int.parse(hex, radix: 16));
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final theme = context.watch<ThemeProvider>();

    final profilesList = auth.profiles;
    final canAdd = profilesList.length < 4;

    return Scaffold(
      backgroundColor: theme.colors.bg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'Who’s watching?',
                  style: GoogleFonts.outfit(
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    color: theme.colors.text,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${auth.user?.displayName}’s account',
                  style: TextStyle(color: theme.colors.textDim, fontSize: 14),
                ),
                const SizedBox(height: 36),

                // Profiles Grid
                Wrap(
                  spacing: 28,
                  runSpacing: 28,
                  alignment: WrapAlignment.center,
                  children: [
                    ...profilesList.map((p) {
                      final profileColor = p.color != null ? _parseHexColor(p.color!) : theme.colors.primary;
                      return GestureDetector(
                        onTap: () => auth.selectProfile(p),
                        child: SizedBox(
                          width: 110,
                          child: Column(
                            children: [
                              Container(
                                width: 92,
                                height: 92,
                                decoration: BoxDecoration(
                                  color: profileColor,
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(color: Colors.transparent, width: 2),
                                  boxShadow: const [
                                    BoxShadow(
                                      color: Colors.black26,
                                      blurRadius: 8,
                                      offset: Offset(0, 4),
                                    ),
                                  ],
                                ),
                                child: p.avatarUrl != null
                                    ? ClipRRect(
                                        borderRadius: BorderRadius.circular(14),
                                        child: Image.network(p.avatarUrl!, fit: BoxFit.cover),
                                      )
                                    : Center(
                                        child: Text(
                                          p.name.substring(0, 1).toUpperCase(),
                                          style: GoogleFonts.outfit(
                                            fontSize: 36,
                                            fontWeight: FontWeight.w800,
                                            color: Colors.white,
                                          ),
                                        ),
                                      ),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                p.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: theme.colors.text,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 15,
                                ),
                              ),
                              if (p.isKids) ...[
                                const SizedBox(height: 2),
                                Text(
                                  'KIDS',
                                  style: TextStyle(
                                    color: theme.colors.accent,
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    }),

                    // Add Profile Button
                    if (canAdd && !_adding)
                      GestureDetector(
                        onTap: () => setState(() => _adding = true),
                        child: SizedBox(
                          width: 110,
                          child: Column(
                            children: [
                              Container(
                                width: 92,
                                height: 92,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: theme.colors.border,
                                    width: 2,
                                    style: BorderStyle.solid, // solid representation in Flutter, can style as dashed with custom painters
                                  ),
                                ),
                                child: Center(
                                  child: Icon(
                                    Icons.add,
                                    size: 40,
                                    color: theme.colors.textDim,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                'Add profile',
                                style: TextStyle(
                                  color: theme.colors.textDim,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 15,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 32),

                // New Profile Form
                if (_adding) ...[
                  Container(
                    width: double.infinity,
                    constraints: const BoxConstraints(maxWidth: 420),
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: theme.colors.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: theme.colors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'New profile',
                          style: TextStyle(
                            color: theme.colors.text,
                            fontWeight: FontWeight.bold,
                            fontSize: 18,
                          ),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _nameController,
                          style: TextStyle(color: theme.colors.text, fontSize: 14),
                          autofocus: true,
                          decoration: InputDecoration(
                            hintText: 'Profile name',
                            hintStyle: TextStyle(color: theme.colors.placeholder),
                            filled: true,
                            fillColor: theme.colors.surfaceAlt,
                            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: BorderSide(color: theme.colors.border),
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),

                        // Swatch Selection
                        Wrap(
                          spacing: 10,
                          alignment: WrapAlignment.center,
                          children: swatches.map((hex) {
                            final swatchColor = _parseHexColor(hex);
                            final active = _selectedColor == hex;
                            return GestureDetector(
                              onTap: () => setState(() => _selectedColor = hex),
                              child: Container(
                                width: 30,
                                height: 30,
                                decoration: BoxDecoration(
                                  color: swatchColor,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: active ? Colors.white : Colors.transparent,
                                    width: 2,
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                        
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            _error!,
                            textAlign: TextAlign.center,
                            style: TextStyle(color: theme.colors.error, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ],
                        const SizedBox(height: 18),

                        // Form Buttons
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                side: BorderSide(color: theme.colors.border),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              onPressed: () => setState(() {
                                _adding = false;
                                _error = null;
                                _nameController.clear();
                              }),
                              child: Text('Cancel', style: TextStyle(color: theme.colors.textDim)),
                            ),
                            const SizedBox(width: 12),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: theme.colors.primary,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                              ),
                              onPressed: _busy ? null : _createProfile,
                              child: _busy
                                  ? const SpinKitThreeBounce(color: Colors.white, size: 16)
                                  : const Text('Create', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 36),
                ],

                // Sign Out Action
                TextButton(
                  onPressed: () => auth.signOut(),
                  child: Text(
                    'Sign out',
                    style: TextStyle(color: theme.colors.textFaint, fontSize: 14),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
