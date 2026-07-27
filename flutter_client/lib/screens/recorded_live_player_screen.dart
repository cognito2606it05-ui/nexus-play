import 'package:flutter/material.dart';

class RecordedLivePlayerScreen extends StatelessWidget {
  final String streamId;
  final String videoUrl;
  
  const RecordedLivePlayerScreen({
    required this.streamId,
    required this.videoUrl,
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Text('Recorded Live Player Screen (StreamID: $streamId)'),
      ),
    );
  }
}
