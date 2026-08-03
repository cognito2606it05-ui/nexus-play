import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
// Placeholders for screens, which we will implement next
import '../screens/login_screen.dart';
import '../screens/profile_gate_screen.dart';
import '../screens/home_screen.dart';
import '../screens/reels_screen.dart';
import '../screens/news_screen.dart';
import '../screens/live_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/reporter_broadcast_screen.dart';
import '../screens/studio_dashboard_screen.dart';
import '../screens/super_admin_dashboard_screen.dart';
import '../screens/top_stories_admin_screen.dart';
import '../screens/watchlist_screen.dart';
import '../screens/recorded_live_player_screen.dart';

// Shell container to wrap the bottom navigation bar and active tab
class ShellScaffold extends StatefulWidget {
  final Widget child;
  const ShellScaffold({required this.child, super.key});

  @override
  State<ShellScaffold> createState() => _ShellScaffoldState();
}

class _ShellScaffoldState extends State<ShellScaffold> {
  int _getCurrentIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    if (location.startsWith('/reels')) return 1;
    if (location.startsWith('/news')) return 2;
    if (location.startsWith('/live')) return 3;
    if (location.startsWith('/profile')) return 4;
    return 0;
  }

  void _onTabTapped(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/');
        break;
      case 1:
        context.go('/reels');
        break;
      case 2:
        context.go('/news');
        break;
      case 3:
        context.go('/live');
        break;
      case 4:
        context.go('/profile');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Implement bottom navigation bar styling and spacing
    return Scaffold(
      body: widget.child,
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: Colors.white10, width: 0.8)),
        ),
        child: BottomNavigationBar(
          currentIndex: _getCurrentIndex(context),
          onTap: (index) => _onTabTapped(context, index),
          type: BottomNavigationBarType.fixed,
          backgroundColor: const Color(0xFF0F172A),
          selectedItemColor: const Color(0xFF3B82F6),
          unselectedItemColor: Colors.white60,
          selectedFontSize: 11,
          unselectedFontSize: 11,
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home), label: 'Home'),
            BottomNavigationBarItem(icon: Icon(Icons.movie_outlined), activeIcon: Icon(Icons.movie), label: 'Reels'),
            BottomNavigationBarItem(icon: Icon(Icons.newspaper_outlined), activeIcon: Icon(Icons.newspaper), label: 'News'),
            BottomNavigationBarItem(icon: Icon(Icons.live_tv_outlined), activeIcon: Icon(Icons.live_tv), label: 'Live TV'),
            BottomNavigationBarItem(icon: Icon(Icons.person_outline), activeIcon: Icon(Icons.person), label: 'Profile'),
          ],
        ),
      ),
    );
  }
}

// Configured GoRouter options
final GoRouter routerConfig = GoRouter(
  initialLocation: '/',
  redirect: (BuildContext context, GoRouterState state) {
    final auth = context.read<AuthProvider>();
    final isLoggedIn = auth.isAuthenticated;
    final hasProfile = auth.activeProfile != null;

    final goingToLogin = state.matchedLocation == '/login';
    final goingToProfileGate = state.matchedLocation == '/profiles-gate';

    // 1. If not logged in, redirect to login
    if (!isLoggedIn) {
      return goingToLogin ? null : '/login';
    }

    // 2. If logged in but no profile is active, redirect to profile gate
    if (isLoggedIn && !hasProfile) {
      return goingToProfileGate ? null : '/profiles-gate';
    }

    // 3. If logged in and profile is active, prevent going to login/profiles-gate
    if (isLoggedIn && hasProfile) {
      if (goingToLogin || goingToProfileGate) return '/';
    }

    return null;
  },
  routes: <RouteBase>[
    GoRoute(
      path: '/login',
      builder: (BuildContext context, GoRouterState state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/profiles-gate',
      builder: (BuildContext context, GoRouterState state) => const ProfileGateScreen(),
    ),
    
    // Bottom Tab routes wrapped inside ShellScaffold
    ShellRoute(
      builder: (BuildContext context, GoRouterState state, Widget child) {
        return ShellScaffold(child: child);
      },
      routes: [
        GoRoute(
          path: '/',
          builder: (BuildContext context, GoRouterState state) => const HomeScreen(),
        ),
        GoRoute(
          path: '/reels',
          builder: (BuildContext context, GoRouterState state) => const ReelsScreen(),
        ),
        GoRoute(
          path: '/news',
          builder: (BuildContext context, GoRouterState state) => const NewsScreen(),
        ),
        GoRoute(
          path: '/live',
          builder: (BuildContext context, GoRouterState state) => const LiveScreen(),
        ),
        GoRoute(
          path: '/profile',
          builder: (BuildContext context, GoRouterState state) => const ProfileScreen(),
        ),
      ],
    ),

    // Subpages and auxiliary admin routes
    GoRoute(
      path: '/reporter-station',
      builder: (BuildContext context, GoRouterState state) => const ReporterBroadcastScreen(),
    ),
    GoRoute(
      path: '/reporter/dashboard',
      builder: (BuildContext context, GoRouterState state) => const StudioDashboardScreen(),
    ),
    GoRoute(
      path: '/super-admin/dashboard',
      builder: (BuildContext context, GoRouterState state) => const SuperAdminDashboardScreen(),
    ),
    GoRoute(
      path: '/top-stories-admin',
      builder: (BuildContext context, GoRouterState state) => const TopStoriesAdminScreen(),
    ),
    GoRoute(
      path: '/watchlist',
      builder: (BuildContext context, GoRouterState state) => const WatchlistScreen(),
    ),
    GoRoute(
      path: '/video/:streamId',
      builder: (BuildContext context, GoRouterState state) {
        final streamId = state.pathParameters['streamId'] ?? '';
        final videoUrl = state.uri.queryParameters['url'] ?? '';
        return RecordedLivePlayerScreen(streamId: streamId, videoUrl: videoUrl);
      },
    ),
  ],
);
