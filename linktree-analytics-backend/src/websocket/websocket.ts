import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { analyticsService } from '../services/analyticsService';
import { suiService } from '../services/suiService';
import { config } from '../config/config';

interface ClientData {
  profileId?: string;
  userId?: string;
  joinedAt: Date;
}

export const setupWebSocket = (io: SocketIOServer) => {
  // Store connected clients
  const connectedClients = new Map<string, ClientData>();

  io.on('connection', (socket: Socket) => {
    logger.info(`WebSocket client connected: ${socket.id}`);
    
    connectedClients.set(socket.id, {
      joinedAt: new Date(),
    });

    // Handle profile subscription
    socket.on('subscribe:profile', async (data: { profileId: string }) => {
      try {
        const { profileId } = data;

        // Validate profile exists
        const profileExists = await suiService.profileExists(profileId);
        if (!profileExists) {
          socket.emit('error', {
            message: 'Profile not found',
            code: 'PROFILE_NOT_FOUND',
          });
          return;
        }

        // Join profile room
        socket.join(`profile:${profileId}`);
        
        // Update client data
        const clientData = connectedClients.get(socket.id);
        if (clientData) {
          clientData.profileId = profileId;
          connectedClients.set(socket.id, clientData);
        }

        // Send initial real-time data
        const realtimeData = await analyticsService.getRealTimeAnalytics(profileId);
        socket.emit('analytics:realtime', {
          profileId,
          data: realtimeData,
          timestamp: new Date().toISOString(),
        });

        logger.debug(`Client ${socket.id} subscribed to profile ${profileId}`);
      } catch (error) {
        logger.error('Error subscribing to profile:', error);
        socket.emit('error', {
          message: 'Failed to subscribe to profile',
          code: 'SUBSCRIPTION_ERROR',
        });
      }
    });

    // Handle profile unsubscription
    socket.on('unsubscribe:profile', (data: { profileId: string }) => {
      try {
        const { profileId } = data;
        socket.leave(`profile:${profileId}`);
        
        // Update client data
        const clientData = connectedClients.get(socket.id);
        if (clientData) {
          clientData.profileId = undefined;
          connectedClients.set(socket.id, clientData);
        }

        logger.debug(`Client ${socket.id} unsubscribed from profile ${profileId}`);
      } catch (error) {
        logger.error('Error unsubscribing from profile:', error);
      }
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', {
        timestamp: new Date().toISOString(),
      });
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket client disconnected: ${socket.id}, reason: ${reason}`);
      connectedClients.delete(socket.id);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      logger.error(`WebSocket error for client ${socket.id}:`, error);
    });
  });

  // Broadcast real-time updates
  const broadcastRealtimeUpdates = async () => {
    try {
      // Get all active profile rooms
      const rooms = io.sockets.adapter.rooms;
      const profileRooms = Array.from(rooms.keys()).filter(room => room.startsWith('profile:'));

      for (const room of profileRooms) {
        const profileId = room.replace('profile:', '');
        
        try {
          const realtimeData = await analyticsService.getRealTimeAnalytics(profileId);
          
          io.to(room).emit('analytics:realtime', {
            profileId,
            data: realtimeData,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error(`Error broadcasting real-time data for profile ${profileId}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error in broadcast real-time updates:', error);
    }
  };

  // Set up periodic real-time updates
  if (config.realtime.enabled) {
    setInterval(broadcastRealtimeUpdates, 10000); // Every 10 seconds
    logger.info('Real-time WebSocket updates enabled');
  }

  // Broadcast new view event
  const broadcastNewView = (profileId: string, viewData: any) => {
    io.to(`profile:${profileId}`).emit('analytics:new_view', {
      profileId,
      data: viewData,
      timestamp: new Date().toISOString(),
    });
  };

  // Broadcast new click event
  const broadcastNewClick = (profileId: string, clickData: any) => {
    io.to(`profile:${profileId}`).emit('analytics:new_click', {
      profileId,
      data: clickData,
      timestamp: new Date().toISOString(),
    });
  };

  // Get connection stats
  const getConnectionStats = () => {
    const totalConnections = connectedClients.size;
    const profileSubscriptions = Array.from(connectedClients.values())
      .filter(client => client.profileId)
      .reduce((acc, client) => {
        const profileId = client.profileId!;
        acc[profileId] = (acc[profileId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return {
      totalConnections,
      profileSubscriptions,
      timestamp: new Date().toISOString(),
    };
  };

  // Heartbeat to keep connections alive
  const heartbeat = () => {
    io.emit('heartbeat', {
      timestamp: new Date().toISOString(),
      connections: connectedClients.size,
    });
  };

  if (config.websocket.enabled) {
    setInterval(heartbeat, config.websocket.heartbeatInterval);
  }

  return {
    broadcastNewView,
    broadcastNewClick,
    getConnectionStats,
  };
};
