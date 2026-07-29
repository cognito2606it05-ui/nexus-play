import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';

import '../providers/auth_provider.dart';
import '../api/api_client.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController(text: 'demo@nexusplay.app');
  final _passwordController = TextEditingController(text: 'password123');
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();

  String _mode = 'login'; // 'login' | 'signup'
  String _method = 'phone'; // 'phone' | 'email'
  
  bool _otpSent = false;
  String? _generatedOtp;
  
  bool _busy = false;
  String? _error;
  bool _rememberMe = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  Future<void> _sendOtpCode() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) {
      setState(() => _error = 'Please enter a valid phone number');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final res = await ApiClient().sendOtp(phone);
      if (mounted) {
        setState(() {
          _otpSent = true;
          _generatedOtp = res['otp']?.toString();
        });
      }
    } catch (e) {
      if (mounted) {
        String message = e.toString();
        if (e is DioException) {
          final data = e.response?.data;
          if (data is Map && data.containsKey('message')) {
            message = data['message'].toString();
          } else if (data is Map && data.containsKey('error')) {
            message = data['error'].toString();
          } else if (e.message != null && e.message!.isNotEmpty) {
            message = e.message!;
          }
        }
        setState(() => _error = message.replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });

    final auth = context.read<AuthProvider>();

    try {
      if (_method == 'phone') {
        final otp = _otpController.text.trim();
        if (otp.isEmpty) {
          throw Exception('Please enter the 6-digit OTP code');
        }
        await auth.signInWithOtp(_phoneController.text.trim(), otp);
      } else {
        if (_mode == 'login') {
          await auth.signIn(_emailController.text.trim(), _passwordController.text);
        } else {
          final name = _nameController.text.trim();
          await auth.signUp(
            _emailController.text.trim(),
            _passwordController.text,
            name.isNotEmpty ? name : _emailController.text.split('@')[0],
          );
        }
      }
    } catch (e) {
      if (mounted) {
        String message = e.toString();
        if (e is DioException) {
          final data = e.response?.data;
          if (data is Map && data.containsKey('message')) {
            message = data['message'].toString();
          } else if (data is Map && data.containsKey('error')) {
            message = data['error'].toString();
          } else if (e.message != null && e.message!.isNotEmpty) {
            message = e.message!;
          }
        }
        setState(() => _error = message.replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF090D1A), Color(0xFF0F172A), Color(0xFF02040A)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Brand Logo
                    Column(
                      children: [
                        Text(
                          'NEXUS PLAY',
                          style: GoogleFonts.outfit(
                            fontSize: 32,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                            letterSpacing: 2,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'PREMIUM NEWS & OTT HUB',
                          style: GoogleFonts.outfit(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: Colors.white60,
                            letterSpacing: 1.2,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 36),

                    // Login Card
                    Container(
                      padding: const EdgeInsets.all(28),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F172A),
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: const Color(0xFF1E293B), width: 1.5),
                        boxShadow: const [
                          BoxShadow(
                            color: Colors.black54,
                            blurRadius: 20,
                            offset: Offset(0, 10),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Welcome to Nexus Play',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.outfit(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Sign in to access live streams and global breaking news',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, height: 1.5),
                          ),
                          const SizedBox(height: 24),

                          // Login Method Selector Tabs
                          Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E293B),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFF334155)),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: GestureDetector(
                                    onTap: () => setState(() {
                                      _method = 'phone';
                                      _error = null;
                                    }),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(vertical: 10),
                                      decoration: BoxDecoration(
                                        color: _method == 'phone' ? const Color(0xFF3B82F6) : Colors.transparent,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text(
                                        'Phone OTP',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 13,
                                          color: _method == 'phone' ? Colors.white : const Color(0xFF94A3B8),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                                Expanded(
                                  child: GestureDetector(
                                    onTap: () => setState(() {
                                      _method = 'email';
                                      _error = null;
                                    }),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(vertical: 10),
                                      decoration: BoxDecoration(
                                        color: _method == 'email' ? const Color(0xFF3B82F6) : Colors.transparent,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text(
                                        'Email / Pass',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 13,
                                          color: _method == 'email' ? Colors.white : const Color(0xFF94A3B8),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),

                          // Dynamic Form Layout
                          if (_method == 'phone') ...[
                            // Phone Flow
                            if (!_otpSent) ...[
                              _buildLabel('Mobile Number'),
                              _buildTextField(
                                controller: _phoneController,
                                hintText: 'Enter mobile number',
                                keyboardType: TextInputType.phone,
                                prefixIcon: Icons.phone_outlined,
                              ),
                            ] else ...[
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        _buildLabel('Verifying Mobile'),
                                        Text(
                                          _phoneController.text,
                                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                                        ),
                                      ],
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: () => setState(() {
                                      _otpSent = false;
                                      _otpController.clear();
                                      _generatedOtp = null;
                                    }),
                                    child: const Text('Change', style: TextStyle(color: Color(0xFF60A5FA), fontWeight: FontWeight.bold)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              _buildLabel('6-Digit OTP'),
                              _buildTextField(
                                controller: _otpController,
                                hintText: '••••••',
                                keyboardType: TextInputType.number,
                                prefixIcon: Icons.lock_outline,
                                maxLength: 6,
                              ),
                              if (_generatedOtp != null) ...[
                                const SizedBox(height: 16),
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: const Color(0x26EAB308),
                                    border: Border.all(color: const Color(0x4DEAB308)),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Column(
                                    children: [
                                      const Text(
                                        'LOCAL DEV OTP CODE:',
                                        style: TextStyle(color: Color(0xFFEAB308), fontWeight: FontWeight.bold, fontSize: 11),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        _generatedOtp!,
                                        style: const TextStyle(color: Color(0xFFFACC15), fontWeight: FontWeight.w900, fontSize: 22, letterSpacing: 4),
                                      ),
                                      const SizedBox(height: 4),
                                      const Text(
                                        'Copy & enter the code above to sign in',
                                        style: TextStyle(color: Colors.white70, fontSize: 11),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ] else ...[
                            // Email Flow
                            if (_mode == 'signup') ...[
                              _buildLabel('Display Name'),
                              _buildTextField(
                                controller: _nameController,
                                hintText: 'Enter display name',
                                keyboardType: TextInputType.name,
                                prefixIcon: Icons.person_outline,
                              ),
                              const SizedBox(height: 16),
                            ],
                            _buildLabel('Email Address'),
                            _buildTextField(
                              controller: _emailController,
                              hintText: 'name@example.com',
                              keyboardType: TextInputType.emailAddress,
                              prefixIcon: Icons.email_outlined,
                            ),
                            const SizedBox(height: 16),
                            _buildLabel('Password'),
                            _buildTextField(
                              controller: _passwordController,
                              hintText: '••••••••',
                              obscureText: true,
                              prefixIcon: Icons.lock_outline,
                            ),
                            if (_mode == 'login') ...[
                              const SizedBox(height: 10),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  GestureDetector(
                                    onTap: () => setState(() => _rememberMe = !_rememberMe),
                                    child: Row(
                                      children: [
                                        SizedBox(
                                          width: 24,
                                          height: 24,
                                          child: Checkbox(
                                            value: _rememberMe,
                                            activeColor: const Color(0xFF3B82F6),
                                            checkColor: Colors.white,
                                            onChanged: (val) => setState(() => _rememberMe = val ?? true),
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        const Text('Remember Me', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.w600)),
                                      ],
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: () {
                                      showDialog(
                                        context: context,
                                        builder: (_) => AlertDialog(
                                          title: const Text('Reset Password'),
                                          content: Text('A simulated password reset instructions has been sent to ${_emailController.text.isNotEmpty ? _emailController.text : "your email"}.'),
                                          actions: [
                                            TextButton(
                                              onPressed: () => Navigator.pop(context),
                                              child: const Text('OK'),
                                            ),
                                          ],
                                        ),
                                      );
                                    },
                                    child: const Text('Forgot Password?', style: TextStyle(color: Color(0xFFEF4444), fontSize: 12, fontWeight: FontWeight.bold)),
                                  ),
                                ],
                              ),
                            ],
                          ],


                          if (_error != null) ...[
                            const SizedBox(height: 16),
                            Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.bold, fontSize: 12),
                            ),
                          ],
                          const SizedBox(height: 24),

                          // Submit Action Button
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF2563EB),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              elevation: 4,
                            ),
                            onPressed: _busy ? null : (_method == 'phone' && !_otpSent ? _sendOtpCode : _submit),
                            child: _busy
                                ? const SpinKitThreeBounce(color: Colors.white, size: 20)
                                : Text(
                                    _method == 'phone'
                                        ? (_otpSent ? 'Verify & Login' : 'Send OTP Code')
                                        : (_mode == 'login' ? 'Sign In' : 'Create Account'),
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Colors.white),
                                  ),
                          ),

                          if (_method == 'email') ...[
                            const SizedBox(height: 16),
                            GestureDetector(
                              onTap: () {
                                setState(() {
                                  _mode = _mode == 'login' ? 'signup' : 'login';
                                  _error = null;
                                });
                              },
                              child: Text.rich(
                                TextSpan(
                                  text: _mode == 'login' ? "New to Nexus Play? " : 'Already have an account? ',
                                  style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                                  children: [
                                    TextSpan(
                                      text: _mode == 'login' ? 'Sign Up' : 'Sign In',
                                      style: const TextStyle(color: Color(0xFF60A5FA), fontWeight: FontWeight.bold),
                                    ),
                                  ],
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Demo Footer Note
                    Text(
                      _method == 'phone'
                          ? 'Entering any phone number will send a simulated verification code.'
                          : 'Demo access: demo@nexusplay.app / password123',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          color: Color(0xFFE2E8F0),
          fontSize: 10,
          fontWeight: FontWeight.bold,
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String hintText,
    bool obscureText = false,
    TextInputType keyboardType = TextInputType.text,
    IconData? prefixIcon,
    int? maxLength,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscureText,
      keyboardType: keyboardType,
      maxLength: maxLength,
      style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
      decoration: InputDecoration(
        hintText: hintText,
        counterText: '',
        hintStyle: const TextStyle(color: Colors.white30),
        prefixIcon: prefixIcon != null ? Icon(prefixIcon, color: const Color(0xFF64748B), size: 20) : null,
        filled: true,
        fillColor: const Color(0xFF1E293B),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF334155)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF3B82F6), width: 1.5),
        ),
      ),
    );
  }
}
